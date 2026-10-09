/**
 * Minimal startup smoke test for this repository's own build.
 *
 * Usage:
 *   bun scripts/smoke-self-build.ts --family=linux
 *   bun scripts/smoke-self-build.ts --family=darwin --dist=dist
 *
 * For each target of that family the CURRENT host can natively execute:
 *   1. start the binary with a NEW home and a clean CWD (no ./drizzle),
 *      on an explicit loopback port, with --no-auto-resume and --no-port-reclaim
 *   2. verify GET /api/health version+commit against source- and hash-checked metadata
 *   3. stop the child this script started
 *   4. start again against the SAME home to prove repeat startup over an
 *      already-migrated data directory
 *
 * Cross-compiled targets are NOT started: their verification is the identity,
 * metadata, checksum and signature checking in `check-self-build.ts`. This
 * script never claims a foreign architecture ran.
 *
 * It starts no update server, forwards no provider credential, makes no model
 * request, and signals only its own children.
 */
import { lstatSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { isBuildFamily } from "./lib/build-targets";
import { resolveGitCommit } from "./lib/release-git";
import {
	assertCleanWorkdir,
	hostRunnableTargets,
	initializeSmokeHome,
	OwnedChildren,
	runSmokeAttempt,
	type SmokeBuildIdentity,
	smokeArgs,
	smokeBinaryPath,
	verifySmokeBinary,
} from "./lib/self-build-smoke";

const ROOT = resolve(import.meta.dir, "..");
/** First start also applies the embedded migrations, so it gets the larger budget. */
const FIRST_START_TIMEOUT_MS = 180_000;
const REPEAT_START_TIMEOUT_MS = 120_000;

const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
	args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const family = option("family") ?? "";
if (!isBuildFamily(family)) {
	console.error("✗ smoke-self-build requires --family=linux|windows|darwin");
	process.exit(1);
}
const distDir = resolve(option("dist") ?? join(ROOT, "dist"));
const version: string = JSON.parse(await Bun.file(join(ROOT, "package.json")).text()).version;

const owned = new OwnedChildren();
const scratch: string[] = [];
let failed = false;

function cleanupScratch(): void {
	// Only directories this run created, and only when it passed: a failed run's
	// home/log output is the evidence a maintainer needs.
	if (failed) return;
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 2 });
}

process.on("exit", () => {
	owned.killAllNow();
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => {
		failed = true;
		owned.killAllNow();
		process.exit(1);
	});
}

/** Find an ephemeral port, then release it. --no-port-reclaim makes a later collision
 * fail instead of killing a listener that acquired the port in the meantime. */
function reservePort(): number {
	const server = Bun.listen({
		hostname: "127.0.0.1",
		port: 0,
		socket: { data() {}, open() {}, close() {} },
	});
	const port = server.port;
	server.stop(true);
	return port;
}

interface Attempt {
	label: string;
	port: number;
	status: number;
	attempts: number;
	elapsedMs: number;
}

async function launch(
	binary: string,
	home: string,
	cwd: string,
	label: string,
	timeoutMs: number,
	identity: SmokeBuildIdentity,
): Promise<Attempt> {
	const port = reservePort();
	try {
		const health = await runSmokeAttempt(owned, smokeArgs(binary, port), {
			home,
			cwd,
			port,
			timeoutMs,
			...identity,
		});
		console.log(
			`  ✓ ${label}: healthy on port ${port} after ${health.elapsedMs}ms ` +
				`(${health.attempts} probe(s)), version ${identity.version}+${identity.commit}`,
		);
		return {
			label,
			port,
			status: health.status,
			attempts: health.attempts,
			elapsedMs: health.elapsedMs,
		};
	} catch (cause) {
		throw new Error(`${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
			cause,
		});
	}
}

const targets = hostRunnableTargets();
const runnable = targets.filter((target) => target.family === family);
if (!runnable.length) {
	console.error(
		`✗ No ${family} target is natively runnable on ${process.platform}/${process.arch}; ` +
			"a family job must run its smoke test on a matching host",
	);
	process.exit(1);
}

try {
	// Never derive source identity from the response or unverified metadata. CI
	// pins checkout to GITHUB_SHA; local builds resolve this source root's HEAD.
	const commit = process.env.GITHUB_SHA ?? resolveGitCommit(ROOT, "HEAD") ?? "";
	for (const target of runnable) {
		const binary = smokeBinaryPath(distDir, version, target);
		let info: ReturnType<typeof lstatSync>;
		try {
			info = lstatSync(binary);
		} catch (cause) {
			// A target this host was supposed to build must name itself in the failure.
			throw new Error(`Missing built binary for ${target.platformId}: ${binary}`, { cause });
		}
		if (!info.isFile() || info.size === 0) throw new Error(`Not a usable binary: ${binary}`);
		if (process.platform !== "win32" && !(info.mode & 0o111))
			throw new Error(`Built binary is not executable: ${binary}`);
		const identity = await verifySmokeBinary(binary, {
			name: basename(binary),
			version,
			platform: target.platformId,
			target: target.target,
			commit,
		});
		console.log(`→ Smoke: ${target.platformId} (${info.size} bytes)`);

		const base = mkdtempSync(join(tmpdir(), "narrafork-selfbuild-smoke-"));
		scratch.push(base);
		const home = join(base, "home", ".narrafork");
		const cwd = join(base, "cwd");
		mkdirSync(home, { recursive: true });
		initializeSmokeHome(home);
		mkdirSync(cwd, { recursive: true });
		// Embedded migrations only: `resolveMigrationsFolder` prefers ./drizzle in the CWD.
		assertCleanWorkdir(cwd);

		await launch(
			binary,
			home,
			cwd,
			`${target.platformId} first start`,
			FIRST_START_TIMEOUT_MS,
			identity,
		);
		// Same home: proves the data directory it just created is reusable, which is
		// exactly the upgrade path self-built releases rely on.
		await launch(
			binary,
			home,
			cwd,
			`${target.platformId} repeat start`,
			REPEAT_START_TIMEOUT_MS,
			identity,
		);
		console.log(`✓ ${target.platformId}: fresh start and repeat start both healthy`);
	}
	console.log(
		`✓ Smoke passed for ${runnable.length} host-runnable ${family} target(s): ` +
			`${runnable.map((target) => target.platformId).join(", ")}. ` +
			"Cross-compiled targets in this family are verified by artifact checks only.",
	);
} catch (error) {
	failed = true;
	console.error(`✗ Self-build smoke failed: ${error instanceof Error ? error.message : error}`);
	console.error(`Retained smoke evidence: ${scratch.join(", ")}`);
	await owned.stopAll();
	process.exit(1);
} finally {
	await owned.stopAll();
	cleanupScratch();
}
