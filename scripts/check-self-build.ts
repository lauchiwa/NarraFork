/**
 * Self-build verification entry point for this repository's own Actions workflow.
 *
 * Modes:
 *   --mode=input                  verify the tracked SQLite migration lineage
 *   --mode=drift                  verify ordinary generation produces no new migration
 *   --mode=output --family=<f>    verify a family's binaries/sidecars/checksums
 *   --mode=package --family=<f>   verify, then package the allowlist (implies output)
 *
 * Version is always read from package.json; `--commit=` defaults to resolved git HEAD
 * (GITHUB_SHA in CI). Nothing here publishes, bumps, tags, commits, pushes or
 * downloads an upstream build; all it does is read local files, plus one
 * disposable generation copy in drift mode.
 */
import { lstatSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

// Must happen BEFORE importing anything that may transitively load the logger or
// settings: those create a NarraFork home at module load. A checker is not a
// licence to touch the developer's real data directory.
if (!process.env.NARRAFORK_HOME) {
	process.env.NARRAFORK_HOME = join(
		mkdtempSync(join(tmpdir(), "narrafork-selfbuild-check-")),
		".narrafork",
	);
	process.env.NARRAFORK_ALLOW_MULTIPLE = "1";
}

const { isBuildFamily } = await import("./lib/build-targets");
const { checkSelfBuildOutput, checkSqliteMigrations, checkSqliteSchemaDrift, packageSelfBuild } =
	await import("./lib/self-build-check");

function option(args: string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	const matches = args.filter((arg) => arg.startsWith(prefix));
	if (matches.length > 1) throw new Error(`Repeated --${name} argument`);
	return matches[0]?.slice(prefix.length);
}

function resolveCommit(explicit: string | undefined): string {
	const candidate =
		explicit ??
		process.env.GITHUB_SHA ??
		Bun.spawnSync(["git", "rev-parse", "HEAD"], {
			cwd: ROOT,
			stdout: "pipe",
			stderr: "pipe",
			timeout: 10_000,
		})
			.stdout.toString()
			.trim();
	if (!/^[a-f0-9]{40}$/.test(candidate))
		throw new Error("A fully resolved 40-character source commit is required");
	return candidate;
}

/** macOS only: ad-hoc signatures are verifiable natively, never on a cross host. */
function verifySignature(path: string): boolean | null {
	if (process.platform !== "darwin") return null;
	const result = Bun.spawnSync(["codesign", "--verify", "--strict", path], {
		stdout: "pipe",
		stderr: "pipe",
		timeout: 120_000,
	});
	return result.exitCode === 0;
}

const args = process.argv.slice(2);
const mode = option(args, "mode") ?? "input";
const version: string = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const distDir = option(args, "dist") ?? join(ROOT, "dist");

/** One legible failure line for a CI log, with the cause chain behind it. */
function fail(error: unknown): never {
	const chain: string[] = [];
	for (let current = error; current instanceof Error; current = current.cause)
		chain.push(current.message);
	console.error(`✗ check-self-build --mode=${mode} failed: ${chain.join(" ← ")}`);
	process.exit(1);
}

try {
	if (mode === "input" || mode === "drift") {
		const lineage = checkSqliteMigrations(join(ROOT, "drizzle"));
		console.log(
			`✓ SQLite lineage: ${lineage.entries.length} tracked migration(s) — ${lineage.entries
				.map((entry) => `${entry.tag}@${entry.sqlSha256.slice(0, 12)}`)
				.join(", ")}`,
		);
		if (mode === "drift") {
			// Generation needs installed dependencies; fail loudly rather than skipping the gate.
			try {
				lstatSync(join(ROOT, "node_modules/drizzle-kit"));
			} catch (cause) {
				throw new Error("Drift check requires installed dependencies (drizzle-kit)", { cause });
			}
			await checkSqliteSchemaDrift({ root: ROOT });
			console.log("✓ No uncommitted SQLite schema drift");
		}
	} else if (mode === "output" || mode === "package") {
		const family = option(args, "family") ?? "";
		if (!isBuildFamily(family)) throw new Error(`--family must be linux, windows or darwin`);
		const result = await checkSelfBuildOutput({
			distDir,
			family,
			version,
			commit: resolveCommit(option(args, "commit")),
			verifySignature,
		});
		for (const entry of result.metadata) {
			const signature = result.signatures[entry.name];
			console.log(
				`✓ ${entry.name} (${entry.platform}, ${entry.size} bytes, sha256 ${entry.sha256.slice(0, 12)}…` +
					`${signature === true ? ", ad-hoc signature verified" : signature === null ? ", signature not verifiable on this host" : ""})`,
			);
		}
		console.log(`✓ ${family}: ${result.targets.length} target(s), ${result.files.length} file(s)`);
		if (mode === "package") {
			const packaged = packageSelfBuild(family, distDir, version, result.files);
			console.log(`✓ Packaged ${packaged.archive} with ${packaged.members.length} member(s)`);
			console.log(JSON.stringify({ family, archive: packaged.archive, files: result.files }));
		} else {
			console.log(JSON.stringify({ family, files: result.files }));
		}
	} else {
		throw new Error(`Unknown --mode: ${mode}`);
	}
} catch (error) {
	fail(error);
}
