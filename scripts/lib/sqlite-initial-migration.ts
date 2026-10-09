import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ResourceMigrationSnapshot } from "../finalize-sqlite-resource-migration";

const ROOT_ID = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === "object" && !Array.isArray(value);

/** Unlike existsSync, this also rejects dangling links used as failure markers. */
export function assertNoSqliteBootstrap(folder: string): void {
	try {
		lstatSync(resolve(folder, "meta/_bootstrap_pending.json"));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}
	throw new Error("Incomplete SQLite bootstrap; inspect the owned disposable copy, never adopt it");
}

export function readSqliteAsset(path: string, maxBytes: number): string {
	const info = lstatSync(path);
	if (!info.isFile() || info.size === 0 || info.size > maxBytes)
		throw new Error(`Invalid SQLite asset type/byte budget: ${path}`);
	return readFileSync(path, "utf8");
}

/** The lockfile-resolved Drizzle SQLite format is journal v7 / snapshot v6.
 * A lone historical fragment is NOT an initial baseline. Semantics are checked separately
 * by the existing finalizer, not inferred from these native metadata fields. */
export function assertSqliteInitialMetadata(
	journal: unknown,
	snapshot: unknown,
): asserts snapshot is ResourceMigrationSnapshot {
	if (
		!record(journal) ||
		journal.version !== "7" ||
		journal.dialect !== "sqlite" ||
		!Array.isArray(journal.entries) ||
		journal.entries.length !== 1
	)
		throw new Error("Invalid native SQLite initial journal");
	const entry = journal.entries[0];
	if (
		!record(entry) ||
		entry.idx !== 0 ||
		entry.version !== "6" ||
		typeof entry.when !== "number" ||
		!Number.isSafeInteger(entry.when) ||
		entry.when <= 0 ||
		entry.breakpoints !== true ||
		typeof entry.tag !== "string" ||
		!/^0000_[\p{L}\p{N}_-]{1,123}$/u.test(entry.tag)
	)
		throw new Error("Invalid native SQLite initial entry");
	if (
		!record(snapshot) ||
		snapshot.version !== "6" ||
		snapshot.dialect !== "sqlite" ||
		typeof snapshot.id !== "string" ||
		!UUID.test(snapshot.id) ||
		snapshot.id === ROOT_ID ||
		snapshot.prevId !== ROOT_ID ||
		!record(snapshot.tables) ||
		!Object.keys(snapshot.tables).length ||
		!record(snapshot.views) ||
		Object.keys(snapshot.views).length !== 0 ||
		!record(snapshot.enums) ||
		Object.keys(snapshot.enums).length !== 0 ||
		!record(snapshot._meta) ||
		!record(snapshot._meta.tables) ||
		Object.keys(snapshot._meta.tables).length !== 0 ||
		!record(snapshot._meta.columns) ||
		Object.keys(snapshot._meta.columns).length !== 0
	)
		throw new Error("Invalid native SQLite root snapshot");
}

/** Only Drizzle's three native baseline assets may be published from a bootstrap stage. */
export function readSqliteInitialMigration(folder: string) {
	if (!lstatSync(folder).isDirectory() || !lstatSync(resolve(folder, "meta")).isDirectory())
		throw new Error("SQLite initial asset directories must not be links");
	const journalText = readSqliteAsset(resolve(folder, "meta/_journal.json"), 1024 * 1024);
	const snapshotText = readSqliteAsset(resolve(folder, "meta/0000_snapshot.json"), 8 * 1024 * 1024);
	const journal: unknown = JSON.parse(journalText);
	const snapshot: unknown = JSON.parse(snapshotText);
	assertSqliteInitialMetadata(journal, snapshot);
	const tag = (journal as { entries: { tag: string }[] }).entries[0].tag;
	if (
		JSON.stringify(readdirSync(folder).sort()) !== JSON.stringify([`${tag}.sql`, "meta"].sort()) ||
		JSON.stringify(readdirSync(resolve(folder, "meta")).sort()) !==
			JSON.stringify(["0000_snapshot.json", "_journal.json"])
	)
		throw new Error("Unexpected SQLite bootstrap assets");
	const sql = readSqliteAsset(resolve(folder, `${tag}.sql`), 1024 * 1024);
	return { tag, journalText, snapshotText, snapshot, sql };
}
