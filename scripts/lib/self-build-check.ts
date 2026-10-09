/**
 * Read-only verification for this repository's own cross-platform build.
 *
 * Three independent concerns, all of which the self-build CI workflow must pass
 * before any artifact is uploaded:
 *
 *  - {@link checkSqliteMigrations}: the SQLite lineage that is actually tracked
 *    in git is complete, native, contiguous and semantically valid. It NEVER
 *    generates, bootstraps, migrates or opens the real database.
 *  - {@link checkSqliteSchemaDrift}: ordinary generation in an isolated copy of
 *    the tracked inputs produces no new migration. A temporary increment is
 *    diagnostic only; it is never substituted for the committed input.
 *  - {@link checkSelfBuildOutput} / {@link packageSelfBuild}: the binaries,
 *    sidecars and both aggregate checksum files for a family's FIXED target set
 *    exist, match their own bytes, and are packaged from an explicit allowlist.
 *
 * Importing this module must not create a NarraFork home or open a database, so
 * the generator (which transitively imports the logger) is loaded lazily inside
 * {@link checkSqliteSchemaDrift} only.
 */
import { createHash } from "node:crypto";
import {
	closeSync,
	cpSync,
	lstatSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	assertResourceMigrationValidated,
	type ResourceMigrationSnapshot,
} from "../finalize-sqlite-resource-migration";
import type { BinaryMetadata } from "./binary-metadata";
import { formatChecksumsReport, formatSha256Sums } from "./binary-metadata";
import {
	assertBinaryMetadata,
	assertIdentityMatchesMetadata,
	fileIdentity,
	MAX_BINARY_BYTES,
	MAX_METADATA_BYTES,
	MAX_TEXT_BYTES,
	readTextAsset,
} from "./build-artifact-identity";
import {
	type BuildFamily,
	type BuildTarget,
	binaryName,
	requiredWatcherKeys,
	targetsForFamily,
} from "./build-targets";
import { assertNoSqliteBootstrap, assertSqliteInitialMetadata } from "./sqlite-initial-migration";

const ROOT_ID = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SQL_BYTES = 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 1024 * 1024;
const MAX_LINEAGE_ENTRIES = 4096;
const MAX_DIST_ENTRIES = 4096;
/** Written by `finalizeResourceMigration`; unfinalized raw Drizzle DDL lacks it. */
const FINALIZED_PREFIX = "PRAGMA foreign_keys=OFF;";
/** Local, gitignored recovery evidence from the last generation. Not lineage identity. */
const TRANSIENT_META_FILES = new Set(["_generation_validated.json"]);
const REFUSED_META_FILES = new Map([
	["_generation.lock", "an unreleased SQLite generation lock"],
	["_generation_pending.json", "an unresolved SQLite generation receipt"],
	["_bootstrap_pending.json", "an incomplete SQLite bootstrap"],
]);
/** Tracked inputs an isolated generation copy needs; everything else is resolved via node_modules. */
export const SQLITE_GENERATION_INPUTS: readonly string[] = [
	"server/db/schema.ts",
	"drizzle.config.ts",
	"tsconfig.json",
	"package.json",
	"bun.lock",
	"shared/i18n-locales.ts",
];

const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);
const sorted = (values: readonly string[]) => [...values].sort();
const sameSet = (actual: readonly string[], expected: readonly string[]) =>
	JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

function readAsset(path: string, maximum: number): string {
	const info = lstatSync(path);
	if (!info.isFile() || info.size === 0 || info.size > maximum)
		throw new Error(`Invalid SQLite lineage asset type/byte budget: ${path}`);
	return readFileSync(path, "utf8");
}

function assertRealDirectory(path: string, label: string): void {
	let info: ReturnType<typeof lstatSync>;
	try {
		info = lstatSync(path);
	} catch (cause) {
		throw new Error(`Missing ${label}: ${path}`, { cause });
	}
	// A link can point outside the checkout, so CI would verify bytes it does not ship.
	if (!info.isDirectory() || info.isSymbolicLink())
		throw new Error(`${label} must be a real directory, not a link: ${path}`);
}

export interface SqliteLineageEntry {
	idx: number;
	tag: string;
	/** Native journal timestamp; also the `__drizzle_migrations.created_at` value. */
	when: number;
	sql: string;
	/** SHA-256 of the SQL bytes — the runtime migration identity. */
	sqlSha256: string;
	snapshot: ResourceMigrationSnapshot;
}

export interface SqliteLineage {
	entries: SqliteLineageEntry[];
	journalText: string;
}

/**
 * Validate the tracked SQLite migration lineage.
 *
 * Checks native journal/snapshot metadata, contiguous unique entries, one-to-one
 * SQL/snapshot correspondence, a correct `prevId` chain, file type/byte budgets,
 * the absence of lock/pending/bootstrap state, and — via the existing finalizer —
 * that each migration's DDL still matches its generated snapshot. Read-only: no
 * file is written and no database other than the finalizer's private in-memory
 * verification databases is opened.
 */
export function checkSqliteMigrations(folder: string): SqliteLineage {
	assertRealDirectory(folder, "SQLite migration folder");
	const meta = resolve(folder, "meta");
	assertRealDirectory(meta, "SQLite migration meta folder");
	assertNoSqliteBootstrap(folder);

	const journalText = readAsset(resolve(meta, "_journal.json"), MAX_JOURNAL_BYTES);
	const journal: unknown = JSON.parse(journalText);
	if (
		!record(journal) ||
		journal.version !== "7" ||
		journal.dialect !== "sqlite" ||
		!Array.isArray(journal.entries) ||
		!journal.entries.length ||
		journal.entries.length > MAX_LINEAGE_ENTRIES
	)
		throw new Error("Invalid native SQLite journal");
	const rawEntries = journal.entries as unknown[];
	const entries = rawEntries.map((entry, index) => {
		if (
			!record(entry) ||
			entry.idx !== index ||
			entry.version !== "6" ||
			entry.breakpoints !== true ||
			typeof entry.when !== "number" ||
			!Number.isSafeInteger(entry.when) ||
			entry.when <= 0 ||
			typeof entry.tag !== "string" ||
			!new RegExp(`^${String(index).padStart(4, "0")}_[\\p{L}\\p{N}_-]{1,123}$`, "u").test(
				entry.tag,
			)
		)
			throw new Error(`Invalid native SQLite journal entry at index ${index}`);
		return { idx: index, tag: entry.tag, when: entry.when };
	});
	if (new Set(entries.map((entry) => entry.tag)).size !== entries.length)
		throw new Error("Duplicate SQLite journal tags");
	// Generation order must be monotonic; equal timestamps stay allowed because two
	// migrations can be generated within the same millisecond.
	for (let index = 1; index < entries.length; index++) {
		if (entries[index].when < entries[index - 1].when)
			throw new Error(`SQLite journal timestamps regress at index ${index}`);
	}

	// Fixed enumeration of the lineage: no extra SQL/snapshot may ride along, and an
	// unfinished generation must fail rather than be embedded into a distribution.
	for (const [name, reason] of REFUSED_META_FILES) {
		try {
			lstatSync(resolve(meta, name));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		throw new Error(`Refusing to verify a lineage with ${reason}: meta/${name}`);
	}
	const metaFiles = readdirSync(meta).filter((name) => !TRANSIENT_META_FILES.has(name));
	if (
		!sameSet(readdirSync(folder), [...entries.map((entry) => `${entry.tag}.sql`), "meta"]) ||
		!sameSet(metaFiles, [
			"_journal.json",
			...entries.map((entry) => `${String(entry.idx).padStart(4, "0")}_snapshot.json`),
		])
	)
		throw new Error("Unexpected SQLite lineage assets");

	const lineage: SqliteLineageEntry[] = [];
	let previousId = ROOT_ID;
	let previousSnapshot: ResourceMigrationSnapshot = { tables: {} };
	for (const entry of entries) {
		const sql = readAsset(resolve(folder, `${entry.tag}.sql`), MAX_SQL_BYTES);
		if (!sql.startsWith(FINALIZED_PREFIX))
			throw new Error(`Unfinalized migration SQL: ${entry.tag}.sql`);
		const snapshotText = readAsset(
			resolve(meta, `${String(entry.idx).padStart(4, "0")}_snapshot.json`),
			MAX_SNAPSHOT_BYTES,
		);
		const snapshot: unknown = JSON.parse(snapshotText);
		if (entries.length === 1) {
			// The stricter one-entry baseline guard also pins the native root metadata.
			assertSqliteInitialMetadata(journal, snapshot);
		} else if (
			!record(snapshot) ||
			snapshot.version !== "6" ||
			snapshot.dialect !== "sqlite" ||
			typeof snapshot.id !== "string" ||
			!UUID.test(snapshot.id) ||
			snapshot.id === ROOT_ID ||
			snapshot.prevId !== previousId ||
			!record(snapshot.tables) ||
			!Object.keys(snapshot.tables).length
		)
			throw new Error(`Invalid native SQLite snapshot chain at index ${entry.idx}`);
		const typed = snapshot as unknown as ResourceMigrationSnapshot & { id: string };
		// Independent semantic validation: the DDL must still produce the snapshot shape.
		assertResourceMigrationValidated(sql, previousSnapshot, typed);
		lineage.push({
			...entry,
			sql,
			sqlSha256: createHash("sha256").update(sql).digest("hex"),
			snapshot: typed,
		});
		previousId = typed.id;
		previousSnapshot = typed;
	}
	return { entries: lineage, journalText };
}

export interface SqliteDriftOptions {
	/** Repository root; defaults to this checkout. */
	root?: string;
	/** Fixture-only generation seam. Production runs the real incremental generator. */
	generate?: (root: string) => Promise<void>;
}

/**
 * Fail when the tracked schema would produce a migration that is not committed.
 *
 * Ordinary generation runs in a disposable copy of the tracked inputs. The
 * original checkout is never written to, and the temporary increment is reported
 * as evidence for the developer to regenerate and commit — it is never used as a
 * build input.
 */
export async function checkSqliteSchemaDrift(options: SqliteDriftOptions = {}): Promise<void> {
	const root = options.root ?? resolve(import.meta.dir, "../..");
	const source = resolve(root, "drizzle");
	const before = checkSqliteMigrations(source);
	const stage = mkdtempSync(join(tmpdir(), "narrafork-selfbuild-drift-"));
	try {
		for (const file of SQLITE_GENERATION_INPUTS)
			cpSync(resolve(root, file), join(stage, file), { recursive: false, force: false });
		// Dependencies are reused read-only; the checkout's node_modules is never replaced.
		symlinkSync(
			resolve(root, "node_modules"),
			join(stage, "node_modules"),
			process.platform === "win32" ? "junction" : "dir",
		);
		cpSync(source, join(stage, "drizzle"), { recursive: true });
		if (options.generate) await options.generate(stage);
		else {
			const { generateSqliteMigrations } = await import("../generate-sqlite-migrations");
			await generateSqliteMigrations([], { root: stage });
		}
		const after = checkSqliteMigrations(join(stage, "drizzle"));
		if (
			after.entries.length !== before.entries.length ||
			after.journalText !== before.journalText ||
			after.entries.some(
				(entry, index) =>
					entry.tag !== before.entries[index].tag ||
					entry.sqlSha256 !== before.entries[index].sqlSha256 ||
					JSON.stringify(entry.snapshot) !== JSON.stringify(before.entries[index].snapshot),
			)
		)
			throw new Error(
				"Schema drift: ordinary generation changed the SQLite lineage. Run `bun run db:generate` " +
					"locally and commit the resulting migration; CI only verifies tracked assets.",
			);
		// The original inputs must be byte-identical afterwards.
		const unchanged = checkSqliteMigrations(source);
		if (
			unchanged.journalText !== before.journalText ||
			unchanged.entries.some((entry, index) => entry.sqlSha256 !== before.entries[index].sqlSha256)
		)
			throw new Error("Drift check mutated the tracked SQLite lineage");
	} finally {
		rmSync(stage, { recursive: true, force: true, maxRetries: 2 });
	}
}

/** Verifiable macOS ad-hoc signature check; `null` when the host cannot verify. */
export type SignatureVerifier = (path: string) => boolean | null;

export interface SelfBuildOutputOptions {
	distDir: string;
	family: BuildFamily;
	version: string;
	/** Fully resolved 40-character source commit of this run. */
	commit: string;
	verifySignature?: SignatureVerifier;
}

export interface SelfBuildOutput {
	family: BuildFamily;
	targets: readonly BuildTarget[];
	metadata: BinaryMetadata[];
	/** Explicit upload allowlist, relative to `distDir`, sorted. */
	files: string[];
	/** Per-binary signature verification, `null` where this host cannot verify. */
	signatures: Record<string, boolean | null>;
}

export const sha256SumsName = (version: string) => `narrafork-${version}-SHA256SUMS`;
export const checksumsReportName = (version: string) => `narrafork-${version}-checksums.txt`;

/**
 * Verify every artifact a family job must produce, then return the exact upload
 * allowlist.
 *
 * The target set is fixed by {@link targetsForFamily}; a missing binary, sidecar
 * or aggregate checksum file fails. Binaries are stream-hashed and compared
 * against their own sidecars, and both aggregate files must equal the bytes the
 * shared formatters produce for exactly these entries — so a stale or partial
 * aggregate cannot pass.
 */
export async function checkSelfBuildOutput(
	options: SelfBuildOutputOptions,
): Promise<SelfBuildOutput> {
	if (!/^\d+\.\d+\.\d+(-[\dA-Za-z.-]+)?$/.test(options.version))
		throw new Error(`Invalid self-build version: ${options.version}`);
	if (!/^[a-f0-9]{40}$/.test(options.commit)) throw new Error("Expected full source commit SHA");
	const targets = targetsForFamily(options.family);
	const metadata: BinaryMetadata[] = [];
	const signatures: Record<string, boolean | null> = {};
	const files: string[] = [];
	// A target the job was supposed to build must fail with a legible reason rather
	// than a bare ENOENT, and must never be skipped because "a glob found no match".
	const required = async <T>(name: string, read: () => Promise<T>): Promise<T> => {
		try {
			return await read();
		} catch (cause) {
			if ((cause as NodeJS.ErrnoException).code === "ENOENT")
				throw new Error(`Missing self-build artifact: ${name}`, { cause });
			throw cause;
		}
	};
	for (const target of targets) {
		const name = binaryName(options.version, target);
		const metadataName = `${name}.metadata.json`;
		const raw = await required(metadataName, () =>
			readTextAsset(join(options.distDir, metadataName), MAX_METADATA_BYTES),
		);
		const parsed = JSON.parse(raw) as BinaryMetadata;
		assertBinaryMetadata(
			parsed,
			{
				name,
				version: options.version,
				platform: target.platformId,
				target: target.target,
				commit: options.commit,
			},
			metadataName,
		);
		const identity = await required(name, () =>
			fileIdentity(join(options.distDir, name), MAX_BINARY_BYTES),
		);
		assertIdentityMatchesMetadata(identity, parsed, name);
		if (options.family === "darwin") {
			// Signing happens before hashing, so a verified signature belongs to these bytes.
			const verified = options.verifySignature?.(join(options.distDir, name)) ?? null;
			if (verified === false)
				throw new Error(`macOS ad-hoc signature verification failed: ${name}`);
			signatures[name] = verified;
		}
		metadata.push(parsed);
		files.push(name, metadataName);
	}
	const sumsName = sha256SumsName(options.version);
	const reportName = checksumsReportName(options.version);
	const sums = await required(sumsName, () =>
		readTextAsset(join(options.distDir, sumsName), MAX_TEXT_BYTES),
	);
	const report = await required(reportName, () =>
		readTextAsset(join(options.distDir, reportName), MAX_TEXT_BYTES),
	);
	// Byte equality rather than substring search: an extra or missing line is a defect.
	if (sums !== formatSha256Sums(metadata))
		throw new Error(`Aggregate ${sumsName} does not match this family's verified binaries`);
	if (report !== formatChecksumsReport(options.version, metadata))
		throw new Error(`Aggregate ${reportName} does not match this family's verified binaries`);
	files.push(sumsName, reportName);

	// A leftover binary from another version must not be mistaken for this build.
	// Prefix comparison, not version parsing: "narrafork-9.9.9-linux-arm64" would
	// otherwise parse as the prerelease version "9.9.9-linux".
	let scanned = 0;
	for (const entry of readdirSync(options.distDir)) {
		if (++scanned > MAX_DIST_ENTRIES) throw new Error("Self-build dist entry limit exceeded");
		if (
			!entry.startsWith(`narrafork-${options.version}-`) &&
			/^narrafork-\d+\.\d+\.\d+/.test(entry)
		)
			throw new Error(`Foreign-version artifact in dist: ${entry}`);
	}
	return { family: options.family, targets, metadata, files: sorted(files), signatures };
}

/** Required `@parcel/watcher` bindings must exist and be non-empty before compiling. */
export function assertWatcherBindings(
	binariesDir: string,
	targets: readonly BuildTarget[],
): string[] {
	const required = requiredWatcherKeys(targets);
	const missing: string[] = [];
	for (const key of required) {
		try {
			const info = lstatSync(join(binariesDir, `watcher-${key}.node`));
			if (!info.isFile() || info.size === 0) missing.push(key);
		} catch {
			missing.push(key);
		}
	}
	if (missing.length)
		throw new Error(
			`Missing @parcel/watcher native binding(s) for the selected targets: ${missing.join(", ")}`,
		);
	return required;
}

export const archiveName = (version: string, family: BuildFamily): string =>
	family === "windows"
		? `narrafork-${version}-windows.zip`
		: `narrafork-${version}-${family === "darwin" ? "macos" : family}.tar.gz`;

/**
 * Archive command for a family's verified allowlist.
 *
 * Unix uses `tar -czf`, which preserves the executable bit that GitHub Actions
 * artifacts do not retain by themselves. Windows uses bsdtar's `-a` (deduced
 * from the `.zip` extension); GNU tar accepts `-a` but silently writes a tar
 * file named `.zip`, so the caller must verify the archive's magic bytes.
 */
export function archiveCommand(
	family: BuildFamily,
	distDir: string,
	archive: string,
	files: readonly string[],
): string[] {
	if (!files.length) throw new Error("Refusing to package an empty file list");
	for (const file of files) {
		if (file.startsWith("-") || file.includes("/") || file.includes("\\"))
			throw new Error(`Unsupported archive member: ${file}`);
	}
	const tool = family === "windows" ? windowsArchiveTool() : "tar";
	return [
		tool,
		...(family === "windows" ? ["-a", "-c", "-f"] : ["-c", "-z", "-f"]),
		join(distDir, archive),
		"-C",
		distDir,
		"--",
		...files,
	];
}

/** bsdtar, not whatever `tar` resolves to; GNU tar cannot write zip archives. */
function windowsArchiveTool(): string {
	const system = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
	const bundled = join(system, "System32", "tar.exe");
	try {
		if (lstatSync(bundled).isFile()) return bundled;
	} catch {}
	return "tar";
}

function run(cmd: string[], timeout = 300_000): string {
	const result = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe", timeout });
	const stdout = new TextDecoder().decode(result.stdout);
	if (result.exitCode !== 0)
		throw new Error(
			`${cmd[0]} failed (${result.exitCode}): ${new TextDecoder().decode(result.stderr).slice(0, 4000)}`,
		);
	return stdout;
}

export interface PackagedSelfBuild {
	archive: string;
	members: string[];
}

/**
 * Package the verified allowlist and prove what the archive contains.
 *
 * Only the explicitly listed members are added: the frontend `dist/frontend`
 * tree, databases, logs, update manifests and patch files are never packaged.
 * The archive format is confirmed by magic bytes and its member list must equal
 * the allowlist exactly.
 */
export function packageSelfBuild(
	family: BuildFamily,
	distDir: string,
	version: string,
	files: readonly string[],
): PackagedSelfBuild {
	const archive = archiveName(version, family);
	run(archiveCommand(family, distDir, archive, files));
	const path = join(distDir, archive);
	// Archives contain several large binaries. Read the magic, not the whole archive.
	const head = Buffer.alloc(4);
	const fd = openSync(path, "r");
	try {
		if (readSync(fd, head, 0, head.length, 0) !== head.length)
			throw new Error(`Archive ${archive} is truncated`);
	} finally {
		closeSync(fd);
	}
	const zip = head[0] === 0x50 && head[1] === 0x4b;
	const gzip = head[0] === 0x1f && head[1] === 0x8b;
	if (family === "windows" ? !zip : !gzip)
		throw new Error(`Archive ${archive} is not in the expected format`);
	const tool = family === "windows" ? windowsArchiveTool() : "tar";
	const members = run([tool, "-t", "-f", path])
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (!sameSet(members, files))
		throw new Error(`Archive ${archive} members differ from the verified allowlist`);
	return { archive, members: sorted(members) };
}
