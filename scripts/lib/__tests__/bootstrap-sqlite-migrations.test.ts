import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyPendingMigrationsByHash } from "../../../server/db/run-migrations";
import { safeSpawn } from "../../../server/lib/spawn";
import {
	bootstrapSqliteMigrations,
	generateSqliteMigrations,
} from "../../generate-sqlite-migrations";
import { readSqliteInitialMigration } from "../sqlite-initial-migration";

const roots: string[] = [];
const ok = { exitCode: 0, stdout: "", stderr: "" };
const sql = "CREATE TABLE widgets(id text PRIMARY KEY NOT NULL, value text DEFAULT 'seed');";
const snapshot = () => ({
	version: "6",
	dialect: "sqlite",
	id: randomUUID(),
	prevId: "00000000-0000-0000-0000-000000000000",
	tables: {
		widgets: {
			name: "widgets",
			columns: {
				id: { name: "id", type: "text", primaryKey: true, notNull: true, autoincrement: false },
				value: {
					name: "value",
					type: "text",
					primaryKey: false,
					notNull: false,
					autoincrement: false,
					default: "'seed'",
				},
			},
			indexes: {},
			foreignKeys: {},
			compositePrimaryKeys: {},
			uniqueConstraints: {},
			checkConstraints: {},
		},
	},
	views: {},
	enums: {},
	_meta: { tables: {}, columns: {} },
});
const entry = { idx: 0, tag: "0000_fixture", version: "6", when: 1, breakpoints: true };
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "nf-bootstrap-fixture-"));
	roots.push(root);
	mkdirSync(join(root, "server/db"), { recursive: true });
	writeFileSync(join(root, "server/db/schema.ts"), "fixture schema");
	writeFileSync(join(root, "drizzle.config.ts"), "fixture config");
	return root;
}
function emit(root: string) {
	const stage = join(root, "drizzle/_bootstrap_stage");
	mkdirSync(join(stage, "meta"), { recursive: true });
	writeFileSync(join(stage, "0000_fixture.sql"), sql);
	writeFileSync(
		join(stage, "meta/_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries: [entry] }),
	);
	writeFileSync(join(stage, "meta/0000_snapshot.json"), JSON.stringify(snapshot()));
	return ok;
}
const pending = (root: string) => join(root, "drizzle/meta/_bootstrap_pending.json");
const bytes = (root: string) =>
	["0000_fixture.sql", "meta/_journal.json", "meta/0000_snapshot.json"].map((file) =>
		readFileSync(join(root, "drizzle", file), "utf8"),
	);
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("bootstrap publishes only finalized native assets; receipt-less one-entry no-op is read-only", async () => {
	const root = fixture();
	await bootstrapSqliteMigrations([], {
		root,
		runGenerate: async (_root, args) => {
			expect(existsSync(pending(root))).toBe(true);
			expect(existsSync(join(root, "drizzle/meta/_generation.lock"))).toBe(true);
			expect(args).toContain("narrafork_baseline");
			return emit(root);
		},
	});
	const before = bytes(root);
	expect(before[0]).toStartWith("PRAGMA foreign_keys=OFF;");
	expect(before[0]).toContain(sql);
	expect(existsSync(pending(root))).toBe(false);
	expect(existsSync(join(root, "drizzle/_bootstrap_stage"))).toBe(false);
	expect(readSqliteInitialMigration(join(root, "drizzle")).tag).toBe("0000_fixture");
	for (let i = 0; i < 2; i++) {
		await generateSqliteMigrations([], { root, runGenerate: async () => ok });
		expect(bytes(root)).toEqual(before);
		expect(existsSync(join(root, "drizzle/meta/_generation_pending.json"))).toBe(false);
	}
	expect(existsSync(join(root, "drizzle/meta/_generation_validated.json"))).toBe(false);
});

test.each([
	"empty",
	"populated",
	"file",
	"link",
	"dangling",
])("bootstrap refuses existing %s without invoking Drizzle", async (kind) => {
	const root = fixture();
	const folder = join(root, "drizzle");
	if (kind === "file") writeFileSync(folder, "owned by someone else");
	else if (kind === "link" || kind === "dangling") {
		const target = join(root, "foreign");
		if (kind === "link") mkdirSync(target);
		symlinkSync(target, folder, process.platform === "win32" ? "junction" : "dir");
	} else {
		mkdirSync(folder);
		if (kind === "populated") writeFileSync(join(folder, "keep"), "immutable");
	}
	let runs = 0;
	await expect(
		bootstrapSqliteMigrations([], {
			root,
			runGenerate: async () => {
				runs++;
				return ok;
			},
		}),
	).rejects.toThrow("absent drizzle");
	expect(runs).toBe(0);
	if (kind === "file") expect(readFileSync(folder, "utf8")).toBe("owned by someone else");
	if (kind === "populated") expect(readFileSync(join(folder, "keep"), "utf8")).toBe("immutable");
});

test.each([
	"--force",
	"--reset",
	"--out=elsewhere",
	"--custom",
	"--name=../escape",
	"--bootstrap",
])("unsupported bootstrap argument %s never reserves output", async (arg) => {
	const root = fixture();
	await expect(bootstrapSqliteMigrations([arg], { root })).rejects.toThrow("Unsupported");
	expect(existsSync(join(root, "drizzle"))).toBe(false);
});

test.each([
	"exit",
	"stdout",
	"stderr",
	"throw",
	"finalizer",
])("failed %s retains pending evidence and cannot be adopted", async (mode) => {
	const root = fixture();
	await expect(
		bootstrapSqliteMigrations([], {
			root,
			runGenerate: async () => {
				emit(root);
				if (mode === "throw") throw new Error("fixture failure");
				return {
					...ok,
					exitCode: mode === "exit" ? 1 : 0,
					stdoutTruncated: mode === "stdout",
					stderrTruncated: mode === "stderr",
				};
			},
			finalize:
				mode === "finalizer"
					? () => {
							throw new Error("fixture finalizer failure");
						}
					: undefined,
		}),
	).rejects.toThrow();
	expect(existsSync(pending(root))).toBe(true);
	expect(existsSync(join(root, "drizzle/meta/_generation.lock"))).toBe(false);
	expect(existsSync(join(root, "drizzle/meta/_journal.json"))).toBe(false);
	expect(readFileSync(join(root, "drizzle/_bootstrap_stage/0000_fixture.sql"), "utf8")).toBe(sql);
	await expect(bootstrapSqliteMigrations([], { root })).rejects.toThrow("absent drizzle");
	await expect(generateSqliteMigrations([], { root })).rejects.toThrow(
		"Incomplete SQLite bootstrap",
	);
});

test.each([
	"server/db/schema.ts",
	"drizzle.config.ts",
	"drizzle/_bootstrap.config.ts",
	"drizzle/_bootstrap_stage/0000_fixture.sql",
	"drizzle/_bootstrap_stage/meta/_journal.json",
	"drizzle/_bootstrap_stage/meta/0000_snapshot.json",
])("bootstrap binds source and raw bytes before publication: %s", async (file) => {
	const root = fixture();
	await expect(
		bootstrapSqliteMigrations([], {
			root,
			runGenerate: async () => emit(root),
			beforeCommit: () => {
				const path = join(root, file);
				writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
			},
		}),
	).rejects.toThrow("changed before publication");
	expect(existsSync(pending(root))).toBe(true);
	expect(existsSync(join(root, "drizzle/0000_fixture.sql"))).toBe(false);
});

test.each([
	"fragment",
	"root",
	"version",
	"extra",
	"unfinalized",
	"constraint",
])("invalid initial/no-op input fails read-only: %s", async (mode) => {
	const root = fixture();
	await bootstrapSqliteMigrations([], { root, runGenerate: async () => emit(root) });
	const meta = join(root, "drizzle/meta");
	if (mode === "extra") {
		writeFileSync(join(root, "drizzle/0001_foreign.sql"), "unowned");
		expect(() => readSqliteInitialMigration(join(root, "drizzle"))).toThrow("Unexpected");
		return;
	}
	if (mode === "fragment") {
		const journal = JSON.parse(readFileSync(join(meta, "_journal.json"), "utf8"));
		journal.entries[0].idx = 188;
		writeFileSync(join(meta, "_journal.json"), JSON.stringify(journal));
		cpSync(join(meta, "0000_snapshot.json"), join(meta, "0188_snapshot.json"));
	} else if (mode === "unfinalized") writeFileSync(join(root, "drizzle/0000_fixture.sql"), sql);
	else {
		const path = join(meta, "0000_snapshot.json");
		const data = JSON.parse(readFileSync(path, "utf8"));
		if (mode === "root") data.prevId = randomUUID();
		if (mode === "version") data.version = "5";
		if (mode === "constraint") data.tables.widgets.columns.value.notNull = true;
		writeFileSync(path, JSON.stringify(data));
	}
	const before = bytes(root);
	await expect(
		generateSqliteMigrations([], { root, runGenerate: async () => ok }),
	).rejects.toThrow();
	expect(bytes(root)).toEqual(before);
});

test("concurrent bootstrap/generate contenders never write into the reserved output", async () => {
	const root = fixture();
	let resume = () => {};
	const wait = new Promise<void>((resolve) => {
		resume = resolve;
	});
	const first = bootstrapSqliteMigrations([], {
		root,
		runGenerate: async () => {
			await wait;
			return emit(root);
		},
	});
	const marker = readFileSync(pending(root), "utf8");
	try {
		await expect(bootstrapSqliteMigrations([], { root })).rejects.toThrow("absent drizzle");
		await expect(generateSqliteMigrations([], { root })).rejects.toThrow(
			"Incomplete SQLite bootstrap",
		);
		expect(readFileSync(pending(root), "utf8")).toBe(marker);
	} finally {
		resume();
		await first;
	}
});

test("an abruptly exited bootstrap retains its lock and pending evidence", async () => {
	const root = fixture();
	const result = await safeSpawn({
		cmd: [
			process.execPath,
			"-e",
			`import {bootstrapSqliteMigrations} from ${JSON.stringify(resolve(import.meta.dir, "../../generate-sqlite-migrations.ts"))}; await bootstrapSqliteMigrations([], {root:${JSON.stringify(root)},runGenerate:async()=>process.exit(23)});`,
		],
		timeout: 10_000,
		maxOutputBytes: 4096,
	});
	expect(result.exitCode).toBe(23);
	expect(existsSync(join(root, "drizzle/meta/_generation.lock"))).toBe(true);
	expect(existsSync(pending(root))).toBe(true);
	await expect(bootstrapSqliteMigrations([], { root })).rejects.toThrow("absent drizzle");
	await expect(generateSqliteMigrations([], { root })).rejects.toThrow(
		"Incomplete SQLite bootstrap",
	);
});

test("ordinary generation never bootstraps missing history", async () => {
	const root = fixture();
	await expect(generateSqliteMigrations([], { root })).rejects.toThrow();
	expect(existsSync(join(root, "drizzle"))).toBe(false);
	await expect(bootstrapSqliteMigrations([`--name=${"x".repeat(124)}`], { root })).rejects.toThrow(
		"Unsupported",
	);
	expect(existsSync(join(root, "drizzle"))).toBe(false);
});

test.each([
	"index",
	"parent",
	"dialect",
	"duplicate",
	"extra",
	"size",
	"directory",
])("malformed bootstrap output never publishes: %s", async (mode) => {
	const root = fixture();
	await expect(
		bootstrapSqliteMigrations([], {
			root,
			runGenerate: async () => {
				emit(root);
				const stage = join(root, "drizzle/_bootstrap_stage");
				if (["index", "dialect", "duplicate"].includes(mode)) {
					const path = join(stage, "meta/_journal.json");
					const journal = JSON.parse(readFileSync(path, "utf8"));
					if (mode === "index") journal.entries[0].idx = 1;
					if (mode === "dialect") journal.dialect = "postgresql";
					if (mode === "duplicate") journal.entries.push(entry);
					writeFileSync(path, JSON.stringify(journal));
				} else if (mode === "parent") {
					const data = snapshot();
					data.prevId = randomUUID();
					writeFileSync(join(stage, "meta/0000_snapshot.json"), JSON.stringify(data));
				} else if (mode === "extra") writeFileSync(join(stage, "0001_unowned.sql"), sql);
				else if (mode === "size")
					writeFileSync(join(stage, "0000_fixture.sql"), " ".repeat(1024 * 1024 + 1));
				else {
					rmSync(join(stage, "0000_fixture.sql"));
					mkdirSync(join(stage, "0000_fixture.sql"));
				}
				return ok;
			},
		}),
	).rejects.toThrow();
	expect(existsSync(pending(root))).toBe(true);
	expect(existsSync(join(root, "drizzle/0000_fixture.sql"))).toBe(false);
});

test.each([
	"0000_fixture.sql",
	"0001_unowned.sql",
	"meta/_journal.json",
])("foreign destination asset %s is never overwritten or adopted", async (file) => {
	const root = fixture();
	await expect(
		bootstrapSqliteMigrations([], {
			root,
			runGenerate: async () => emit(root),
			beforeCommit: () => {
				writeFileSync(join(root, "drizzle", file), "foreign bytes");
			},
		}),
	).rejects.toThrow("Unexpected SQLite bootstrap destination assets");
	expect(readFileSync(join(root, "drizzle", file), "utf8")).toBe("foreign bytes");
	expect(existsSync(pending(root))).toBe(true);
});

test("a replacement finalizer cannot bypass read-only semantic validation", async () => {
	const root = fixture();
	await expect(
		bootstrapSqliteMigrations([], {
			root,
			runGenerate: async () => emit(root),
			finalize: (raw) => raw,
		}),
	).rejects.toThrow("Unvalidated");
	expect(existsSync(pending(root))).toBe(true);
	expect(existsSync(join(root, "drizzle/0000_fixture.sql"))).toBe(false);
});

test("real Drizzle full-schema bootstrap, no-op and second additive generation preserve baseline bytes and data", async () => {
	const root = fixture();
	const repo = resolve(import.meta.dir, "../../..");
	// Only tracked schema/config inputs; the owned dependency junction is never replaced.
	for (const file of [
		"server/db/schema.ts",
		"drizzle.config.ts",
		"tsconfig.json",
		"package.json",
		"bun.lock",
		"shared/i18n-locales.ts",
	]) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		cpSync(join(repo, file), join(root, file));
	}
	symlinkSync(
		join(repo, "node_modules"),
		join(root, "node_modules"),
		process.platform === "win32" ? "junction" : "dir",
	);
	await bootstrapSqliteMigrations([], { root });
	const initial = readSqliteInitialMigration(join(root, "drizzle"));
	expect(Object.keys(initial.snapshot.tables)).toHaveLength(116);
	await generateSqliteMigrations([], { root });
	expect(readSqliteInitialMigration(join(root, "drizzle"))).toEqual(initial);
	const baselineFolder = join(root, "baseline");
	cpSync(join(root, "drizzle"), baselineFolder, { recursive: true });
	const schemaPath = join(root, "server/db/schema.ts");
	writeFileSync(
		schemaPath,
		`${readFileSync(schemaPath, "utf8")}\nexport const selfBuildFixture = sqliteTable("self_build_fixture", { id: text("id").primaryKey(), note: text("note").notNull().default("retained") });\n`,
	);
	await generateSqliteMigrations(["--name", "fixture_additive"], { root });
	const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"));
	expect(journal.entries).toHaveLength(2);
	expect(journal.entries[0]).toEqual(JSON.parse(initial.journalText).entries[0]);
	expect(readFileSync(join(root, `drizzle/${initial.tag}.sql`), "utf8")).toBe(initial.sql);
	expect(readFileSync(join(root, "drizzle/meta/0000_snapshot.json"), "utf8")).toBe(
		initial.snapshotText,
	);
	const upgraded = new Database(":memory:"),
		fresh = new Database(":memory:");
	try {
		upgraded.exec("PRAGMA foreign_keys=ON");
		fresh.exec("PRAGMA foreign_keys=ON");
		applyPendingMigrationsByHash(upgraded, baselineFolder);
		upgraded.exec(
			"INSERT INTO users(id, username, password_hash, created_at) VALUES ('fixture', 'fixture', 'fixture-hash', '2026-01-01')",
		);
		applyPendingMigrationsByHash(upgraded, join(root, "drizzle"));
		applyPendingMigrationsByHash(fresh, join(root, "drizzle"));
		for (const db of [upgraded, fresh]) {
			db.exec("INSERT INTO self_build_fixture(id) VALUES ('fixture')");
			expect(db.query("SELECT note FROM self_build_fixture").get()).toEqual({ note: "retained" });
			applyPendingMigrationsByHash(db, join(root, "drizzle"));
			expect(db.query("SELECT count(*) AS n FROM __drizzle_migrations").get()).toEqual({ n: 2 });
			expect(db.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
			expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
			expect(db.query("PRAGMA integrity_check").get()).toEqual({ integrity_check: "ok" });
		}
		const catalog = (db: Database) =>
			db.query("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();
		expect(catalog(upgraded)).toEqual(catalog(fresh));
		expect(upgraded.query("SELECT username FROM users").get()).toEqual({ username: "fixture" });
	} finally {
		upgraded.close();
		fresh.close();
	}
	await generateSqliteMigrations([], { root });
	expect(readFileSync(join(root, `drizzle/${initial.tag}.sql`), "utf8")).toBe(initial.sql);
}, 90_000);
