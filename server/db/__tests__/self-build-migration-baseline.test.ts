import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertResourceMigrationValidated } from "../../../scripts/finalize-sqlite-resource-migration";
import { readSqliteInitialMigration } from "../../../scripts/lib/sqlite-initial-migration";
import { safeSpawn } from "../../lib/spawn";
import { applyPendingMigrationsByHash } from "../run-migrations";

const folder = resolve(import.meta.dir, "../../../drizzle");
const initial = readSqliteInitialMigration(folder);
const roots: string[] = [];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const catalog = (db: Database) =>
	db.query("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function assertCompleteShape(db: Database) {
	const tables = db
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
		)
		.all()
		.map((row) => row.name);
	expect(tables).toEqual(Object.keys(initial.snapshot.tables).sort());
	expect(tables).toHaveLength(116);
	for (const [name, expected] of Object.entries(initial.snapshot.tables)) {
		const columns = db
			.query<{ name: string; type: string; notnull: number; hidden: number }, []>(
				`PRAGMA table_xinfo(${quote(name)})`,
			)
			.all();
		expect(columns.map((row) => row.name).sort()).toEqual(Object.keys(expected.columns).sort());
		for (const column of columns) {
			const target = expected.columns[column.name];
			expect(column.type.toLowerCase()).toBe(target.type);
			expect(column.notnull).toBe(target.notNull ? 1 : 0);
			expect(column.hidden).toBe(
				target.generated ? (target.generated.type === "virtual" ? 2 : 3) : 0,
			);
		}
		const indices = db
			.query<{ name: string; unique: number; origin: string }, []>(
				`PRAGMA index_list(${quote(name)})`,
			)
			.all()
			.filter((row) => row.origin === "c");
		expect(indices.map((row) => row.name).sort()).toEqual(
			Object.keys(expected.indexes ?? {}).sort(),
		);
		for (const index of indices) {
			expect(index.unique).toBe(expected.indexes?.[index.name].isUnique ? 1 : 0);
		}
	}
	expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
	expect(db.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
}

const seed = `
INSERT INTO users(id, username, password_hash, created_at) VALUES ('user', 'fixture', 'fixture-hash', '2026-01-01');
INSERT INTO narrators(id, owner_user_id, created_at, updated_at) VALUES ('narrator', 'user', '2026-01-01', '2026-01-01');
INSERT INTO narrator_messages(id, narrator_id, role, content_json, created_at) VALUES ('message', 'narrator', 'assistant', '[{"type":"compact","status":"running"}]', '2026-01-01');
INSERT INTO narrator_tool_calls(id, narrator_id, message_id, tool_use_id, tool_name, created_at) VALUES ('tool', 'narrator', 'message', 'tool-use', 'fixture', '2026-01-01');
INSERT INTO narrator_worktree_resources(id, owner_narrator_id, device_id, repository_key, worktree_path, state, create_request_id) VALUES ('resource', 'narrator', 'device', 'repository', '/fixture', 'ready', 'request');
`;

test.each([
	false,
	true,
])("tracked baseline initializes complete schema and repeats without data loss; FK enabled=%s", (foreignKeys) => {
	// The existing semantic validator independently checks every default, FK, CHECK,
	// unique/partial index and generated expression, not merely table/column names.
	assertResourceMigrationValidated(initial.sql, { tables: {} }, initial.snapshot);
	const db = new Database(":memory:");
	try {
		db.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
		applyPendingMigrationsByHash(db, folder);
		assertCompleteShape(db); // No ensureColumns, Spec repair or lifecycle startup can mask missing DDL.
		db.exec(seed);
		expect(db.query("SELECT compact_pending FROM narrator_messages").get()).toEqual({
			compact_pending: 1,
		});
		expect(db.query("SELECT started_at FROM narrator_tool_calls").get()).toEqual({
			started_at: "2026-01-01",
		});
		db.exec("UPDATE narrator_tool_calls SET execution_started_at='2026-01-02' WHERE id='tool'");
		expect(db.query("SELECT started_at FROM narrator_tool_calls").get()).toEqual({
			started_at: "2026-01-02",
		});
		db.exec("UPDATE narrator_messages SET content_json='[]' WHERE id='message'");
		expect(db.query("SELECT compact_pending FROM narrator_messages").get()).toEqual({
			compact_pending: 0,
		});
		expect(
			db
				.query(
					"SELECT scope_kind, ownership_revision, container_config FROM narrator_worktree_resources",
				)
				.get(),
		).toEqual({ scope_kind: "unknown", ownership_revision: 0, container_config: null });
		expect(() => db.exec("UPDATE narrator_worktree_resources SET ownership_revision=-1")).toThrow(
			"CHECK",
		);
		expect(() => db.exec("UPDATE narrator_worktree_resources SET scope_kind='invalid'")).toThrow(
			"CHECK",
		);
		expect(() =>
			db.exec(
				"INSERT INTO users(id, username, password_hash, created_at) VALUES ('duplicate', 'fixture', 'fixture-hash', '2026-01-01')",
			),
		).toThrow("UNIQUE");
		if (foreignKeys)
			expect(() =>
				db.exec("UPDATE narrators SET owner_user_id='missing' WHERE id='narrator'"),
			).toThrow("FOREIGN KEY");
		const before = catalog(db);
		const tables = [
			"users",
			"narrators",
			"narrator_messages",
			"narrator_tool_calls",
			"narrator_worktree_resources",
		];
		const rows = () => tables.map((table) => db.query(`SELECT * FROM ${table}`).all());
		const seeded = rows();
		const ledger = db.query("SELECT hash, created_at FROM __drizzle_migrations").all();
		expect(ledger).toEqual([
			{
				hash: createHash("sha256").update(initial.sql).digest("hex"),
				created_at: JSON.parse(initial.journalText).entries[0].when,
			},
		]);
		applyPendingMigrationsByHash(db, folder);
		expect(rows()).toEqual(seeded);
		expect(catalog(db)).toEqual(before);
		expect(db.query("SELECT hash, created_at FROM __drizzle_migrations").all()).toEqual(ledger);
		expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: foreignKeys ? 1 : 0 });
		expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
	} finally {
		db.close();
	}
});

test("runMigrations twice in a bounded isolated child does not repair missing baseline schema or lose seeded data", async () => {
	const root = mkdtempSync(join(tmpdir(), "nf-baseline-lifecycle-fixture-"));
	roots.push(root);
	cpSync(folder, join(root, "drizzle"), { recursive: true });
	const module = resolve(import.meta.dir, "../run-migrations.ts");
	const result = await safeSpawn({
		cmd: [
			process.execPath,
			"-e",
			`
			import { Database } from "bun:sqlite";
			import { strict as assert } from "node:assert";
			import { applyPendingMigrationsByHash, runMigrations } from ${JSON.stringify(module)};
			let db = new Database(":memory:");
			const catalog = () => db.query("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").all();
			try {
				db.exec("PRAGMA foreign_keys=ON");
				applyPendingMigrationsByHash(db, "./drizzle");
				assert.equal(db.query("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'").get().n, 116);
				const before = catalog();
				db.close();
				db = new Database(":memory:");
				db.exec("PRAGMA foreign_keys=ON");
				const first = await runMigrations(db);
				db.exec(${JSON.stringify(seed)});
				const second = await runMigrations(db);
				assert.equal(first.source, "filesystem"); assert.equal(second.source, "filesystem");
				assert.deepEqual(catalog(), before);
				assert.equal(db.query("SELECT count(*) AS n FROM __drizzle_migrations").get().n, 1);
				assert.equal(db.query("SELECT username FROM users").get().username, "fixture");
				assert.equal(db.query("SELECT compact_pending FROM narrator_messages").get().compact_pending, 1);
				assert.deepEqual(db.query("PRAGMA foreign_key_check").all(), []);
				assert.equal(db.query("PRAGMA integrity_check").get().integrity_check, "ok");
				console.log("BASELINE_LIFECYCLE_OK");
			} finally { db.close(); }
		`,
		],
		cwd: root,
		env: { ...process.env, NARRAFORK_HOME: join(root, "home"), NARRAFORK_ALLOW_MULTIPLE: "1" },
		timeout: 20_000,
		maxOutputBytes: 16 * 1024,
	});
	expect(result.stderr).toBe("");
	expect(result.exitCode).toBe(0);
	expect(result.stdoutTruncated || result.stderrTruncated).toBe(false);
	expect(result.stdout).toContain("BASELINE_LIFECYCLE_OK");
});
