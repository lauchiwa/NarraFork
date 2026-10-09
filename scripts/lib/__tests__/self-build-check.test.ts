import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import {
	finalizeResourceMigration,
	type ResourceMigrationSnapshot,
} from "../../finalize-sqlite-resource-migration";
import {
	type BinaryMetadata,
	computeBinaryMetadataFromBuffer,
	formatChecksumsReport,
	formatMetadataJson,
	formatSha256Sums,
} from "../binary-metadata";
import {
	assertBinaryMetadata,
	assertIdentityMatchesMetadata,
	fileIdentity,
} from "../build-artifact-identity";
import {
	BUILD_TARGETS,
	type BuildFamily,
	binaryName,
	isBuildFamily,
	requiredWatcherKeys,
	targetsForFamily,
} from "../build-targets";
import {
	assertWatcherBindings,
	checkSelfBuildOutput,
	checkSqliteMigrations,
	checkSqliteSchemaDrift,
	SQLITE_GENERATION_INPUTS,
} from "../self-build-check";

const REPO = resolve(import.meta.dir, "../../..");
const COMMIT = "a".repeat(40);
const roots: string[] = [];
const temp = (prefix: string) => {
	const root = mkdtempSync(join(tmpdir(), prefix));
	roots.push(root);
	return root;
};
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 2 });
});

// ── SQLite lineage fixtures ─────────────────────────────────────────────────

const table = (name: string, extra = false) => ({
	name,
	columns: {
		id: { name: "id", type: "text", primaryKey: true, notNull: true, autoincrement: false },
		...(extra
			? {
					note: {
						name: "note",
						type: "text",
						primaryKey: false,
						notNull: false,
						autoincrement: false,
						default: "'kept'",
					},
				}
			: {}),
	},
	indexes: {},
	foreignKeys: {},
	compositePrimaryKeys: {},
	uniqueConstraints: {},
	checkConstraints: {},
});
const snapshotOf = (tables: string[], prevId: string) => ({
	version: "6",
	dialect: "sqlite",
	id: randomUUID(),
	prevId,
	tables: Object.fromEntries(tables.map((name) => [name, table(name, name === "gadgets")])),
	views: {},
	enums: {},
	_meta: { tables: {}, columns: {} },
});
const ROOT_ID = "00000000-0000-0000-0000-000000000000";

interface FixtureEntry {
	tag: string;
	rawSql: string;
	tables: string[];
}
const FIXTURE_ENTRIES: FixtureEntry[] = [
	{
		tag: "0000_fixture_baseline",
		rawSql: "CREATE TABLE `widgets` (\n\t`id` text PRIMARY KEY NOT NULL\n);\n",
		tables: ["widgets"],
	},
	{
		tag: "0001_fixture_additive",
		rawSql:
			"CREATE TABLE `gadgets` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`note` text DEFAULT 'kept'\n);\n",
		tables: ["gadgets", "widgets"],
	},
];

/** Build a finalized, chained lineage of `count` entries the way generation would. */
function lineageFixture(count = 1, folder = join(temp("nf-selfbuild-lineage-"), "drizzle")) {
	mkdirSync(join(folder, "meta"), { recursive: true });
	const entries: Array<{
		idx: number;
		version: string;
		when: number;
		tag: string;
		breakpoints: true;
	}> = [];
	let previous: ResourceMigrationSnapshot = { tables: {} };
	let prevId = ROOT_ID;
	for (let index = 0; index < count; index++) {
		const fixture = FIXTURE_ENTRIES[index];
		const snapshot = snapshotOf(fixture.tables, prevId);
		writeFileSync(
			join(folder, `${fixture.tag}.sql`),
			finalizeResourceMigration(
				fixture.rawSql,
				previous,
				snapshot as unknown as ResourceMigrationSnapshot,
			),
		);
		writeFileSync(
			join(folder, `meta/${String(index).padStart(4, "0")}_snapshot.json`),
			JSON.stringify(snapshot),
		);
		entries.push({
			idx: index,
			version: "6",
			when: 1_700_000_000_000 + index,
			tag: fixture.tag,
			breakpoints: true,
		});
		previous = snapshot as unknown as ResourceMigrationSnapshot;
		prevId = snapshot.id;
	}
	writeFileSync(
		join(folder, "meta/_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries }),
	);
	return folder;
}

// ── Input mode ──────────────────────────────────────────────────────────────

test("the tracked repository lineage passes input verification", () => {
	const lineage = checkSqliteMigrations(join(REPO, "drizzle"));
	expect(lineage.entries).toHaveLength(1);
	expect(lineage.entries[0]).toMatchObject({ idx: 0, tag: "0000_narrafork_baseline" });
	expect(lineage.entries[0].sqlSha256).toMatch(/^[a-f0-9]{64}$/);
	expect(Object.keys(lineage.entries[0].snapshot.tables)).toHaveLength(116);
	expect(JSON.parse(lineage.journalText).entries).toHaveLength(1);
});

test.each([1, 2])("a finalized %i-entry lineage passes and exposes runtime hashes", (count) => {
	const folder = lineageFixture(count);
	const lineage = checkSqliteMigrations(folder);
	expect(lineage.entries.map((entry) => entry.tag)).toEqual(
		FIXTURE_ENTRIES.slice(0, count).map((entry) => entry.tag),
	);
	expect(lineage.entries.at(-1)?.sql).toStartWith("PRAGMA foreign_keys=OFF;");
	// Transient local recovery evidence is ignored, not treated as lineage identity.
	writeFileSync(join(folder, "meta/_generation_validated.json"), "{}");
	expect(checkSqliteMigrations(folder).entries).toHaveLength(count);
});

test.each([
	["missing-sql", "Unexpected SQLite lineage assets"],
	["missing-snapshot", "Unexpected SQLite lineage assets"],
	["extra-sql", "Unexpected SQLite lineage assets"],
	["gap", "Invalid native SQLite journal entry at index 1"],
	["duplicate-tag", "Invalid native SQLite journal entry at index 1"],
	["empty-journal", "Invalid native SQLite journal"],
	["journal-version", "Invalid native SQLite journal"],
	["entry-version", "Invalid native SQLite journal entry at index 0"],
	["breakpoints", "Invalid native SQLite journal entry at index 0"],
	["when", "Invalid native SQLite journal entry at index 0"],
	["timestamp-regression", "SQLite journal timestamps regress"],
	["chain", "Invalid native SQLite snapshot chain at index 1"],
	["root-parent", "Invalid native SQLite root snapshot"],
	["unfinalized", "Unfinalized migration SQL"],
	["tampered-sql", "differs from generated snapshot"],
	["lock", "unreleased SQLite generation lock"],
	["pending", "unresolved SQLite generation receipt"],
	["bootstrap-pending", "Incomplete SQLite bootstrap"],
	["empty-sql", "Invalid SQLite lineage asset type/byte budget"],
	["link", "must be a real directory"],
])("input verification rejects %s", (mode, message) => {
	const folder = lineageFixture(mode === "root-parent" || mode === "link" ? 1 : 2);
	const meta = join(folder, "meta");
	const journalPath = join(meta, "_journal.json");
	const journal = JSON.parse(readFileSync(journalPath, "utf8"));
	const write = () => writeFileSync(journalPath, JSON.stringify(journal));
	if (mode === "missing-sql") rmSync(join(folder, "0001_fixture_additive.sql"));
	else if (mode === "missing-snapshot") rmSync(join(meta, "0001_snapshot.json"));
	else if (mode === "extra-sql") writeFileSync(join(folder, "0002_unowned.sql"), "SELECT 1;");
	else if (mode === "gap") {
		journal.entries[1].idx = 2;
		write();
	} else if (mode === "duplicate-tag") {
		journal.entries[1].tag = journal.entries[0].tag;
		write();
	} else if (mode === "empty-journal") {
		journal.entries = [];
		write();
	} else if (mode === "journal-version") {
		journal.version = "6";
		write();
	} else if (mode === "entry-version") {
		journal.entries[0].version = "5";
		write();
	} else if (mode === "breakpoints") {
		journal.entries[0].breakpoints = false;
		write();
	} else if (mode === "when") {
		journal.entries[0].when = 0;
		write();
	} else if (mode === "timestamp-regression") {
		journal.entries[1].when = journal.entries[0].when - 1;
		write();
	} else if (mode === "chain") {
		const path = join(meta, "0001_snapshot.json");
		const snapshot = JSON.parse(readFileSync(path, "utf8"));
		snapshot.prevId = randomUUID();
		writeFileSync(path, JSON.stringify(snapshot));
	} else if (mode === "root-parent") {
		const path = join(meta, "0000_snapshot.json");
		const snapshot = JSON.parse(readFileSync(path, "utf8"));
		snapshot.prevId = randomUUID();
		writeFileSync(path, JSON.stringify(snapshot));
	} else if (mode === "unfinalized")
		writeFileSync(join(folder, "0001_fixture_additive.sql"), FIXTURE_ENTRIES[1].rawSql);
	else if (mode === "tampered-sql")
		writeFileSync(
			join(folder, "0001_fixture_additive.sql"),
			readFileSync(join(folder, "0001_fixture_additive.sql"), "utf8").replace("'kept'", "'lost'"),
		);
	else if (mode === "lock") mkdirSync(join(meta, "_generation.lock"));
	else if (mode === "pending") writeFileSync(join(meta, "_generation_pending.json"), "{}");
	else if (mode === "bootstrap-pending") writeFileSync(join(meta, "_bootstrap_pending.json"), "{}");
	else if (mode === "empty-sql") writeFileSync(join(folder, "0001_fixture_additive.sql"), "");
	else if (mode === "link") {
		const linked = join(folder, "..", "linked");
		symlinkSync(folder, linked, process.platform === "win32" ? "junction" : "dir");
		expect(() => checkSqliteMigrations(linked)).toThrow(message);
		return;
	}
	expect(() => checkSqliteMigrations(folder)).toThrow(message);
});

test("input verification reports a missing lineage instead of generating one", () => {
	expect(() => checkSqliteMigrations(join(temp("nf-selfbuild-absent-"), "drizzle"))).toThrow(
		"Missing SQLite migration folder",
	);
});

// ── Drift mode ──────────────────────────────────────────────────────────────

function driftFixture() {
	const root = temp("nf-selfbuild-drift-");
	for (const file of SQLITE_GENERATION_INPUTS) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		writeFileSync(join(root, file), "fixture input");
	}
	mkdirSync(join(root, "node_modules"));
	lineageFixture(1, join(root, "drizzle"));
	return root;
}

test("drift verification accepts an unchanged lineage and never mutates the source", async () => {
	const root = driftFixture();
	const before = readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8");
	let staged = "";
	await checkSqliteSchemaDrift({
		root,
		generate: async (stage) => {
			// Generation runs in a disposable copy, never in the checkout under test.
			expect(stage).not.toBe(root);
			staged = stage;
		},
	});
	expect(staged).toBeTruthy();
	expect(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8")).toBe(before);
	expect(checkSqliteMigrations(join(root, "drizzle")).entries).toHaveLength(1);
});

test("drift verification fails when generation would append a migration", async () => {
	const root = driftFixture();
	const before = readFileSync(join(root, "drizzle/0000_fixture_baseline.sql"), "utf8");
	await expect(
		checkSqliteSchemaDrift({
			root,
			// Simulate the real generator appending an increment inside its own copy.
			generate: async (stage) => {
				lineageFixture(2, join(stage, "drizzle"));
			},
		}),
	).rejects.toThrow("Schema drift");
	expect(readFileSync(join(root, "drizzle/0000_fixture_baseline.sql"), "utf8")).toBe(before);
	expect(checkSqliteMigrations(join(root, "drizzle")).entries).toHaveLength(1);
});

test("drift verification propagates a generation failure instead of passing", async () => {
	await expect(
		checkSqliteSchemaDrift({
			root: driftFixture(),
			generate: async () => {
				throw new Error("fixture generation failure");
			},
		}),
	).rejects.toThrow("fixture generation failure");
});

// ── Target table ────────────────────────────────────────────────────────────

test("the build target table covers eight targets across three families", () => {
	expect(BUILD_TARGETS).toHaveLength(8);
	expect(new Set(BUILD_TARGETS.map((entry) => entry.platformId)).size).toBe(8);
	expect(targetsForFamily("linux").map((entry) => entry.platformId)).toEqual([
		"linux-x64",
		"linux-x64-baseline",
		"linux-arm64",
	]);
	expect(targetsForFamily("windows").map((entry) => entry.platformId)).toEqual([
		"win-x64",
		"win-x64-baseline",
		"win-arm64",
	]);
	expect(targetsForFamily("darwin").map((entry) => entry.platformId)).toEqual([
		"darwin-arm64",
		"darwin-x64",
	]);
	expect(binaryName("1.2.3", targetsForFamily("windows")[0])).toBe(
		"narrafork-1.2.3-windows-x64.exe",
	);
	expect(isBuildFamily("linux")).toBe(true);
	expect(isBuildFamily("android")).toBe(false);
	expect(() => targetsForFamily("android" as BuildFamily)).toThrow("Unknown build family");
	// Linux needs both libc flavours; the x64 baseline shares one binding with x64.
	expect(requiredWatcherKeys(targetsForFamily("linux"))).toEqual([
		"linux-arm64-glibc",
		"linux-arm64-musl",
		"linux-x64-glibc",
		"linux-x64-musl",
	]);
	expect(requiredWatcherKeys(targetsForFamily("windows"))).toEqual(["win32-arm64", "win32-x64"]);
	expect(requiredWatcherKeys(targetsForFamily("darwin"))).toEqual(["darwin-arm64", "darwin-x64"]);
});

test.each([
	"absent",
	"empty",
	"directory",
])("strict watcher binding verification rejects a %s binding", (mode) => {
	const dir = temp("nf-selfbuild-watcher-");
	const targets = targetsForFamily("windows");
	for (const key of requiredWatcherKeys(targets))
		writeFileSync(join(dir, `watcher-${key}.node`), "binding");
	const path = join(dir, "watcher-win32-arm64.node");
	if (mode === "absent") rmSync(path);
	else if (mode === "empty") writeFileSync(path, "");
	else {
		rmSync(path);
		mkdirSync(path);
	}
	expect(() => assertWatcherBindings(dir, targets)).toThrow("win32-arm64");
	expect(assertWatcherBindings(dir, targetsForFamily("darwin").slice(0, 0))).toEqual([]);
});

// ── Output mode ─────────────────────────────────────────────────────────────

const VERSION = "9.9.9";

function distFixture(family: BuildFamily, version = VERSION, commit = COMMIT.slice(0, 7)) {
	const distDir = temp("nf-selfbuild-dist-");
	const entries: BinaryMetadata[] = [];
	for (const target of targetsForFamily(family)) {
		const name = binaryName(version, target);
		const body = Buffer.from(`compiled ${target.target}`);
		writeFileSync(join(distDir, name), body);
		const metadata = computeBinaryMetadataFromBuffer(name, body, {
			version,
			platformId: target.platformId,
			target: target.target,
			commit,
			buildDate: new Date(1_700_000_000_000).toISOString(),
		});
		writeFileSync(join(distDir, `${name}.metadata.json`), formatMetadataJson(metadata));
		entries.push(metadata);
	}
	const sums = join(distDir, `narrafork-${version}-SHA256SUMS`);
	const report = join(distDir, `narrafork-${version}-checksums.txt`);
	writeFileSync(sums, formatSha256Sums(entries));
	writeFileSync(report, formatChecksumsReport(version, entries));
	return { distDir, entries, sums, report };
}

test.each([
	"linux",
	"windows",
	"darwin",
] as BuildFamily[])("output verification accepts a complete %s family and returns an explicit allowlist", async (family) => {
	const { distDir } = distFixture(family);
	// Build byproducts that must never be packaged still do not fail verification.
	mkdirSync(join(distDir, "frontend"));
	writeFileSync(join(distDir, "frontend/index.html"), "<html></html>");
	writeFileSync(join(distDir, "latest.yml"), "version: 9.9.9\n");
	writeFileSync(join(distDir, "narrafork.db"), "sqlite");
	const result = await checkSelfBuildOutput({
		distDir,
		family,
		version: VERSION,
		commit: COMMIT,
		verifySignature: () => true,
	});
	const targets = targetsForFamily(family);
	expect(result.metadata).toHaveLength(targets.length);
	expect(result.files).toEqual(
		[
			...targets.flatMap((target) => [
				binaryName(VERSION, target),
				`${binaryName(VERSION, target)}.metadata.json`,
			]),
			`narrafork-${VERSION}-SHA256SUMS`,
			`narrafork-${VERSION}-checksums.txt`,
		].sort(),
	);
	expect(result.files).not.toContain("frontend");
	expect(result.files).not.toContain("latest.yml");
	expect(result.files).not.toContain("narrafork.db");
	expect(Object.keys(result.signatures)).toHaveLength(family === "darwin" ? 2 : 0);
});

test.each([
	"binary",
	"sidecar",
	"sums",
	"report",
])("output verification fails on a missing %s", async (mode) => {
	const fixture = distFixture("linux");
	const target = targetsForFamily("linux")[2];
	const name = binaryName(VERSION, target);
	const removed =
		mode === "binary"
			? name
			: mode === "sidecar"
				? `${name}.metadata.json`
				: mode === "sums"
					? `narrafork-${VERSION}-SHA256SUMS`
					: `narrafork-${VERSION}-checksums.txt`;
	rmSync(join(fixture.distDir, removed));
	await expect(
		checkSelfBuildOutput({
			distDir: fixture.distDir,
			family: "linux",
			version: VERSION,
			commit: COMMIT,
		}),
	).rejects.toThrow(`Missing self-build artifact: ${removed}`);
});

test("output verification fails on a tampered binary", async () => {
	const { distDir } = distFixture("linux");
	const name = binaryName(VERSION, targetsForFamily("linux")[0]);
	writeFileSync(join(distDir, name), "tampered after hashing");
	await expect(
		checkSelfBuildOutput({ distDir, family: "linux", version: VERSION, commit: COMMIT }),
	).rejects.toThrow(`Binary size/hash mismatch: ${name}`);
});

test.each([
	"commit",
	"version",
	"platform",
	"target",
	"buildDate",
	"size",
	"sha256",
])("output verification fails on a wrong metadata %s", async (field) => {
	const { distDir } = distFixture("linux");
	const name = binaryName(VERSION, targetsForFamily("linux")[0]);
	const path = join(distDir, `${name}.metadata.json`);
	const metadata = JSON.parse(readFileSync(path, "utf8"));
	if (field === "commit") metadata.commit = "b".repeat(7);
	else if (field === "version") metadata.version = "9.9.8";
	else if (field === "platform") metadata.platform = "linux-arm64";
	else if (field === "target") metadata.target = "bun-linux-arm64";
	else if (field === "buildDate") metadata.buildDate = "not-a-date";
	else if (field === "size") metadata.size = 0;
	else metadata.sha256 = "z".repeat(64);
	writeFileSync(path, formatMetadataJson(metadata));
	await expect(
		checkSelfBuildOutput({ distDir, family: "linux", version: VERSION, commit: COMMIT }),
	).rejects.toThrow(`Invalid binary metadata/provenance: ${name}.metadata.json`);
});

test.each([
	"sums",
	"report",
])("output verification fails on an incomplete aggregate %s", async (mode) => {
	const fixture = distFixture("linux");
	const dropped = fixture.entries.slice(0, 2);
	writeFileSync(
		mode === "sums" ? fixture.sums : fixture.report,
		mode === "sums" ? formatSha256Sums(dropped) : formatChecksumsReport(VERSION, dropped),
	);
	await expect(
		checkSelfBuildOutput({
			distDir: fixture.distDir,
			family: "linux",
			version: VERSION,
			commit: COMMIT,
		}),
	).rejects.toThrow("does not match this family's verified binaries");
});

test("output verification rejects a leftover artifact from another version", async () => {
	const { distDir } = distFixture("linux");
	// A prerelease-looking platform suffix must not be mistaken for a version.
	writeFileSync(join(distDir, "narrafork-0.0.1-linux-x64"), "stale");
	await expect(
		checkSelfBuildOutput({ distDir, family: "linux", version: VERSION, commit: COMMIT }),
	).rejects.toThrow("Foreign-version artifact in dist: narrafork-0.0.1-linux-x64");
});

test("output verification fails a failed macOS signature and records an unverifiable host", async () => {
	const { distDir } = distFixture("darwin");
	await expect(
		checkSelfBuildOutput({
			distDir,
			family: "darwin",
			version: VERSION,
			commit: COMMIT,
			verifySignature: () => false,
		}),
	).rejects.toThrow("macOS ad-hoc signature verification failed");
	const unverified = await checkSelfBuildOutput({
		distDir,
		family: "darwin",
		version: VERSION,
		commit: COMMIT,
		verifySignature: () => null,
	});
	expect(Object.values(unverified.signatures)).toEqual([null, null]);
});

test.each([
	["short commit", "b".repeat(7)],
	["empty commit", ""],
])("output verification requires a fully resolved source %s", async (_label, commit) => {
	const { distDir } = distFixture("linux");
	await expect(
		checkSelfBuildOutput({ distDir, family: "linux", version: VERSION, commit }),
	).rejects.toThrow("Expected full source commit SHA");
});

test("output verification rejects an unusable version", async () => {
	const { distDir } = distFixture("linux");
	await expect(
		checkSelfBuildOutput({ distDir, family: "linux", version: "latest", commit: COMMIT }),
	).rejects.toThrow("Invalid self-build version");
});

// ── Shared identity helpers (also used by the release publisher) ────────────

test("shared identity helpers bound reads and reject mismatched bytes", async () => {
	const dir = temp("nf-selfbuild-identity-");
	const path = join(dir, "artifact");
	writeFileSync(path, "payload");
	const identity = await fileIdentity(path, 1024);
	expect(identity.size).toBe(7);
	await expect(fileIdentity(path, 3)).rejects.toThrow("Invalid asset size/type");
	writeFileSync(join(dir, "empty"), "");
	await expect(fileIdentity(join(dir, "empty"), 1024)).rejects.toThrow("Invalid asset size/type");
	await expect(fileIdentity(dir, 1024)).rejects.toThrow("Invalid asset size/type");
	const metadata = computeBinaryMetadataFromBuffer("artifact", Buffer.from("payload"), {
		version: "1.0.0",
		platformId: "linux-x64",
		target: "bun-linux-x64",
		commit: COMMIT.slice(0, 12),
		buildDate: new Date(0).toISOString(),
	});
	assertIdentityMatchesMetadata(identity, metadata, "artifact");
	expect(() =>
		assertIdentityMatchesMetadata({ ...identity, size: 8 }, metadata, "artifact"),
	).toThrow("Binary size/hash mismatch");
	const expected = {
		name: "artifact",
		version: "1.0.0",
		platform: "linux-x64",
		target: "bun-linux-x64",
		commit: COMMIT,
	};
	assertBinaryMetadata(metadata, expected, "artifact");
	expect(() =>
		assertBinaryMetadata(metadata, { ...expected, commit: "c".repeat(40) }, "x"),
	).toThrow("Invalid binary metadata/provenance: x");
	expect(() => assertBinaryMetadata(metadata, { ...expected, commit: "short" }, "x")).toThrow(
		"Expected full source commit SHA",
	);
});

// ── Real strict seams, using dummy bytes and cached fixture dependencies only ──

test.each([
	false,
	true,
])("postprocessing metadata failure is fatal only with strict=%s", async (strict) => {
	const distDir = temp("nf-selfbuild-worker-");
	const name = "narrafork-9.9.9-windows-x64.exe";
	writeFileSync(join(distDir, name), "fixture bytes, not an executable");
	mkdirSync(join(distDir, `${name}.metadata.json`)); // Force sidecar write failure.
	const worker = new Worker(resolve(REPO, "scripts/post-process-worker.ts"), {
		workerData: {
			platform: { target: "bun-windows-x64", platformId: "win-x64", name },
			distDir,
			root: distDir,
			version: VERSION,
			commit: COMMIT,
			strict,
		},
	});
	try {
		const result = new Promise<{ metadata?: BinaryMetadata }>((resolve, reject) => {
			worker.on("message", (message) => {
				if (message.type === "done") resolve(message);
			});
			worker.on("error", reject);
			worker.on("exit", (code) => {
				if (code !== 0) reject(new Error(`Worker exit ${code}`));
			});
		});
		if (strict) await expect(result).rejects.toThrow("Metadata generation failed");
		else expect((await result).metadata).toBeDefined(); // Legacy warning-only behavior retained.
	} finally {
		await worker.terminate();
	}
}, 15_000);

test.each([
	false,
	true,
])("download CLI enforces cached required binding bytes with strict=%s without networking", async (strict) => {
	const root = temp("nf-selfbuild-watcher-cli-");
	mkdirSync(join(root, "scripts"));
	cpSync(
		join(REPO, "scripts/download-parcel-watcher.ts"),
		join(root, "scripts/download-parcel-watcher.ts"),
	);
	mkdirSync(join(root, "node_modules/@parcel/watcher"), { recursive: true });
	writeFileSync(
		join(root, "node_modules/@parcel/watcher/package.json"),
		JSON.stringify({ version: "fixture" }),
	);
	const dir = join(root, "server/generated/parcel-watcher-binaries");
	mkdirSync(dir, { recursive: true });
	for (const key of requiredWatcherKeys(BUILD_TARGETS))
		writeFileSync(
			join(dir, `watcher-${key}.node`),
			key === "win32-arm64" ? "" : "cached fixture binding",
		);
	const { safeSpawn } = await import("../../../server/lib/spawn");
	const result = await safeSpawn({
		cmd: [
			process.execPath,
			join(root, "scripts/download-parcel-watcher.ts"),
			...(strict ? ["--strict", "--require=win32-x64,win32-arm64"] : []),
		],
		cwd: root,
		timeout: 10_000,
		maxOutputBytes: 16 * 1024,
	});
	expect(result.exitCode).toBe(strict ? 1 : 0);
	if (strict)
		expect(result.stderr).toContain(
			"Missing required @parcel/watcher native binding(s): win32-arm64",
		);
	else
		expect(readFileSync(join(root, "server/generated/parcel-native-loader.ts"), "utf8")).toContain(
			"watcher-win32-x64.node",
		);
	expect(result.stdout).not.toContain("↓");
});

// ── The checker never touches the real data directory ───────────────────────

test("the checker entry point isolates NARRAFORK_HOME and refuses an unknown mode", async () => {
	const home = join(temp("nf-selfbuild-home-"), ".narrafork");
	const { safeSpawn } = await import("../../../server/lib/spawn");
	const script = resolve(import.meta.dir, "../../check-self-build.ts");
	const result = await safeSpawn({
		cmd: [process.execPath, script, "--mode=bogus"],
		cwd: REPO,
		env: { ...process.env, NARRAFORK_HOME: home, NARRAFORK_ALLOW_MULTIPLE: "1" },
		timeout: 60_000,
		maxOutputBytes: 64 * 1024,
	});
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("Unknown --mode");
	const input = await safeSpawn({
		cmd: [process.execPath, script, "--mode=input"],
		cwd: REPO,
		env: { ...process.env, NARRAFORK_HOME: home, NARRAFORK_ALLOW_MULTIPLE: "1" },
		timeout: 60_000,
		maxOutputBytes: 64 * 1024,
	});
	expect(input.exitCode).toBe(0);
	expect(input.stdout).toContain("0000_narrafork_baseline");
}, 120_000);

test("the tracked generation inputs exist and stay in sync with the bootstrap fixture", () => {
	for (const file of SQLITE_GENERATION_INPUTS) {
		// A drift copy can only be built from inputs that are actually tracked.
		expect(() => readFileSync(join(REPO, file))).not.toThrow();
	}
	const copied = temp("nf-selfbuild-inputs-");
	for (const file of SQLITE_GENERATION_INPUTS) {
		mkdirSync(join(copied, file, ".."), { recursive: true });
		cpSync(join(REPO, file), join(copied, file));
	}
	expect(readFileSync(join(copied, "drizzle.config.ts"), "utf8")).toContain("server/db/schema.ts");
});
