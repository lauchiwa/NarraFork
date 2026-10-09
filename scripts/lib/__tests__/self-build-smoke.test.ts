/**
 * Behavioural tests for the self-build smoke helpers.
 *
 * These cover the decisions that would otherwise only be observable inside a CI
 * job: which targets a host may claim to have run, that no credential or
 * inherited listener setting reaches the child, that a dead child fails fast
 * instead of waiting out the budget, and that only owned children are signalled.
 */
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { computeBinaryMetadataFromBuffer } from "../binary-metadata";
import { BUILD_TARGETS } from "../build-targets";
import {
	assertCleanWorkdir,
	drainSmokeStderr,
	healthUrl,
	hostRunnableTargets,
	initializeSmokeHome,
	type OwnedChild,
	OwnedChildren,
	pollHealth,
	runSmokeAttempt,
	smokeArgs,
	smokeBinaryPath,
	smokeEnv,
	verifySmokeBinary,
} from "../self-build-smoke";

const VERSION = "0.8.3";
const BUILD_COMMIT = "4e04d2f2";
const SOURCE_COMMIT = `${BUILD_COMMIT}${"a".repeat(32)}`;
const roots: string[] = [];
const temp = () => {
	const root = mkdtempSync(join(tmpdir(), "nf-selfbuild-smoke-"));
	roots.push(root);
	return root;
};
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 2 });
});

test.each([
	["linux", "x64", ["linux-x64", "linux-x64-baseline"]],
	["linux", "arm64", ["linux-arm64"]],
	// Baseline is a CPU-feature subset of the same OS/arch, so an x64 host runs both.
	["win32", "x64", ["win-x64", "win-x64-baseline"]],
	["win32", "arm64", ["win-arm64"]],
	["darwin", "arm64", ["darwin-arm64"]],
	["darwin", "x64", ["darwin-x64"]],
])("a %s/%s host may only claim to run %p", (platform, arch, expected) => {
	expect(hostRunnableTargets(platform, arch).map((target) => target.platformId)).toEqual(expected);
});

test("emulation is never assumed, and unknown hosts run nothing", () => {
	// An arm64 macOS host must NOT claim the x64 build ran, even though Rosetta
	// often exists: the artifact checks are what cover cross-compiled targets.
	expect(hostRunnableTargets("darwin", "arm64").map((t) => t.platformId)).not.toContain(
		"darwin-x64",
	);
	expect(hostRunnableTargets("linux", "x64").map((t) => t.platformId)).not.toContain("linux-arm64");
	expect(hostRunnableTargets("freebsd", "x64")).toEqual([]);
	expect(hostRunnableTargets("linux", "riscv64")).toEqual([]);
});

test("every runner platform in the matrix has at least one runnable target", () => {
	for (const [platform, arch] of [
		["linux", "x64"],
		["win32", "x64"],
		["darwin", "arm64"],
	]) {
		expect(hostRunnableTargets(platform, arch).length).toBeGreaterThan(0);
	}
});

test("runnable targets always come from the authoritative target table", () => {
	for (const platform of ["linux", "win32", "darwin"]) {
		for (const target of hostRunnableTargets(platform, "x64"))
			expect(BUILD_TARGETS).toContain(target);
	}
});

test("binary paths follow the build's naming for the selected target", () => {
	const target = BUILD_TARGETS.find((entry) => entry.platformId === "linux-x64");
	if (!target) throw new Error("missing linux-x64 target");
	expect(smokeBinaryPath("/dist", "1.2.3", target)).toBe(
		join("/dist", "narrafork-1.2.3-linux-x64"),
	);
});

test("launch args pin loopback, an explicit port, no auto-resume and no port reclamation", () => {
	expect(smokeArgs("/dist/narrafork", 45_000)).toEqual([
		"/dist/narrafork",
		"--no-auto-resume",
		"--no-port-reclaim",
		"--port=45000",
		"--host=127.0.0.1",
	]);
	expect(healthUrl(45_000)).toBe("http://127.0.0.1:45000/api/health");
});

test("the real smoke entry uses smokeArgs for both first and repeat launches", () => {
	// Do not import the CLI: it launches the product at module evaluation time.
	const source = readFileSync(join(import.meta.dir, "../../smoke-self-build.ts"), "utf8");
	expect(source).toContain("await runSmokeAttempt(owned, smokeArgs(binary, port), {");
	expect(source).toMatch(
		/await launch\(\s*binary,\s*home,\s*cwd,\s*[^,]+first start[^,]+,\s*FIRST_START_TIMEOUT_MS,\s*identity,?\s*\)/,
	);
	expect(source).toMatch(
		/await launch\(\s*binary,\s*home,\s*cwd,\s*[^,]+repeat start[^,]+,\s*REPEAT_START_TIMEOUT_MS,\s*identity,?\s*\)/,
	);
	// Thin CLI wiring: source identity cannot come from the health reply. Both
	// attempts receive the same identity verified before any smoke home/launch.
	expect(source).toContain('process.env.GITHUB_SHA ?? resolveGitCommit(ROOT, "HEAD")');
	expect(source).toMatch(
		/const identity = await verifySmokeBinary\(binary, \{\s*name: basename\(binary\),\s*version,\s*platform: target.platformId,\s*target: target.target,\s*commit,/,
	);
	expect(source.indexOf("await verifySmokeBinary(")).toBeLessThan(
		source.indexOf("const base = mkdtempSync("),
	);
	expect(source).toMatch(
		/runSmokeAttempt\(owned, smokeArgs\(binary, port\), \{[^}]*\.\.\.identity,/,
	);
});

function artifactFixture() {
	const root = temp();
	const name = `narrafork-${VERSION}-windows-x64.exe`;
	const binary = join(root, name);
	const bytes = Buffer.from("fixture bytes, not an executable");
	const metadata = computeBinaryMetadataFromBuffer(name, bytes, {
		version: VERSION,
		platformId: "win-x64",
		target: "bun-windows-x64",
		commit: BUILD_COMMIT,
		buildDate: "2026-01-01T00:00:00.000Z",
	});
	writeFileSync(binary, bytes);
	const sidecar = `${binary}.metadata.json`;
	writeFileSync(sidecar, JSON.stringify(metadata));
	const expected = {
		name,
		version: VERSION,
		platform: metadata.platform,
		target: metadata.target,
		commit: SOURCE_COMMIT,
	};
	return { binary, bytes, sidecar, metadata, expected };
}

test.each([
	7, 8, 12, 40,
])("smoke identity preserves the exact verified %i-character build commit", async (length) => {
	const fixture = artifactFixture();
	fixture.metadata.commit = SOURCE_COMMIT.slice(0, length);
	const sidecar = JSON.stringify(fixture.metadata);
	writeFileSync(fixture.sidecar, sidecar);
	expect(await verifySmokeBinary(fixture.binary, fixture.expected)).toEqual({
		version: VERSION,
		commit: fixture.metadata.commit,
	});
	expect(readFileSync(fixture.binary)).toEqual(fixture.bytes);
	expect(readFileSync(fixture.sidecar, "utf8")).toBe(sidecar);
});

test.each([
	["version", "0.0.0"],
	["commit", "deadbeef"],
	["commit", ""],
	["name", "other.exe"],
	["platform", "linux-x64"],
	["target", "bun-linux-x64"],
	["sha256", "0".repeat(64)],
	["sha512", `${"A".repeat(86)}==`],
	["size", 1],
])("smoke refuses mismatched sidecar %s=%p before deriving health expectations", async (key, value) => {
	const fixture = artifactFixture();
	writeFileSync(fixture.sidecar, JSON.stringify({ ...fixture.metadata, [key]: value }));
	await expect(verifySmokeBinary(fixture.binary, fixture.expected)).rejects.toThrow();
});

test.each([
	"",
	BUILD_COMMIT,
	"b".repeat(40),
])("smoke refuses missing, abbreviated or different source identity %p", async (commit) => {
	const fixture = artifactFixture();
	await expect(
		verifySmokeBinary(fixture.binary, { ...fixture.expected, commit }),
	).rejects.toThrow();
});

test("smoke refuses a missing sidecar or changed binary bytes", async () => {
	const fixture = artifactFixture();
	writeFileSync(fixture.binary, Buffer.alloc(fixture.bytes.length, "x"));
	await expect(verifySmokeBinary(fixture.binary, fixture.expected)).rejects.toThrow(
		"size/hash mismatch",
	);
	rmSync(fixture.sidecar);
	await expect(verifySmokeBinary(fixture.binary, fixture.expected)).rejects.toThrow();
});

test.each([0, 80, 1023, 65_536, 1.5, Number.NaN])("launch args refuse port %p", (port) => {
	expect(() => smokeArgs("/dist/narrafork", port)).toThrow(/port out of range/i);
});

test("the smoke environment isolates the home and drops inherited listener settings", () => {
	const env = smokeEnv("/tmp/home/.narrafork", {
		NARRAFORK_HOME: "/real/home/.narrafork",
		NARRAFORK_ALLOW_MULTIPLE: "1",
		NARRAFORK_FORCE_UNLOCK: "1",
		PORT: "7779",
		HOST: "0.0.0.0",
		PATH: "/usr/bin",
	});
	expect(env.NARRAFORK_HOME).toBe("/tmp/home/.narrafork");
	// Explicit verification homes bypass instance-lock liveness/maintenance probing.
	expect(env.NARRAFORK_ALLOW_MULTIPLE).toBe("1");
	expect(env.NARRAFORK_FORCE_UNLOCK).toBeUndefined();
	// `--port=`/`--host=` decide the listener, so ambient values cannot interfere.
	expect(env.PORT).toBeUndefined();
	expect(env.HOST).toBeUndefined();
	expect(env.PATH).toBe("/usr/bin");
});

test("no credential-shaped variable is forwarded to the child", () => {
	const env = smokeEnv("/tmp/home/.narrafork", {
		ANTHROPIC_API_KEY: "sk-test",
		OPENAI_API_KEY: "sk-test",
		GITHUB_TOKEN: "ghp-test",
		MY_SECRET: "x",
		DB_PASSWORD: "x",
		GOOGLE_APPLICATION_CREDENTIALS: "/tmp/creds.json",
		HOME: "/home/runner",
	});
	for (const key of [
		"ANTHROPIC_API_KEY",
		"OPENAI_API_KEY",
		"GITHUB_TOKEN",
		"MY_SECRET",
		"DB_PASSWORD",
		"GOOGLE_APPLICATION_CREDENTIALS",
	])
		expect(env[key]).toBeUndefined();
	expect(env.HOME).toBe("/tmp/home/.narrafork");
	expect(env.USERPROFILE).toBe(env.HOME);
	for (const key of [
		"APPDATA",
		"LOCALAPPDATA",
		"XDG_CONFIG_HOME",
		"XDG_CACHE_HOME",
		"XDG_DATA_HOME",
		"XDG_RUNTIME_DIR",
	])
		expect(env[key]).toStartWith(join(env.HOME));
});

test("ambient database, restart handoff, profile and plugin settings cannot leak into smoke", () => {
	const env = smokeEnv(temp(), {
		home: "/real",
		userprofile: "/real",
		AppData: "/real",
		Path: "/tools",
		NF_DATABASE_BACKEND: "postgres",
		NF_DATABASE_URL: "postgres://foreign",
		DATABASE_URL: "postgres://foreign",
		NARRAFORK_GRACEFUL_RESTART_URL: "http://localhost:7778",
		NARRAFORK_GRACEFUL_RESTART_MARKER_PATH: "/foreign/marker",
		CODEX_HOME: "/real/codex",
		NF_PLUGINS_ENABLED: "1",
		NODE_OPTIONS: "--import=/foreign.ts",
		HTTPS_PROXY: "http://proxy",
	});
	expect(env.Path).toBe("/tools");
	expect(env.NF_DATABASE_BACKEND).toBe("sqlite");
	expect(env.NF_PLUGINS_ENABLED).toBe("0");
	for (const key of [
		"home",
		"userprofile",
		"AppData",
		"NF_DATABASE_URL",
		"DATABASE_URL",
		"NARRAFORK_GRACEFUL_RESTART_URL",
		"NARRAFORK_GRACEFUL_RESTART_MARKER_PATH",
		"CODEX_HOME",
		"NODE_OPTIONS",
		"HTTPS_PROXY",
	])
		expect(env[key]).toBeUndefined();
	expect(() => smokeEnv("relative/home")).toThrow("absolute");
});

test("smoke settings disable optional integrations and never overwrite an existing home", () => {
	const home = temp();
	initializeSmokeHome(home);
	const settings = readFileSync(join(home, "settings.json"), "utf8");
	expect(JSON.parse(settings)).toMatchObject({
		server: { openBrowser: "off" },
		update: { checkIntervalMinutes: 0, autoDownload: false },
		plugins: { enabled: false },
		vnet: { enabled: false, udp: { enabled: false } },
	});
	expect(() => initializeSmokeHome(home)).toThrow();
	expect(readFileSync(join(home, "settings.json"), "utf8")).toBe(settings);
});

test("a CWD containing migrations is refused so embedded ones are exercised", () => {
	const root = temp();
	assertCleanWorkdir(root);
	mkdirSync(join(root, "drizzle"));
	// `resolveMigrationsFolder` prefers ./drizzle, which would silently bypass the
	// migrations compiled into the binary.
	expect(() => assertCleanWorkdir(root)).toThrow(/must not contain \.\/drizzle/);
});

test("health polling succeeds once the server answers", async () => {
	let clock = 0;
	let calls = 0;
	const result = await pollHealth({
		port: 45_000,
		timeoutMs: 10_000,
		intervalMs: 100,
		now: () => clock,
		sleep: async (ms) => {
			clock += ms;
		},
		fetch: async (url) => {
			expect(url).toBe(healthUrl(45_000));
			if (++calls < 3) throw new Error("ECONNREFUSED");
			return { ok: true, status: 200, json: async () => ({ status: "ok", version: "0.8.3" }) };
		},
	});
	expect(result.status).toBe(200);
	expect(result.attempts).toBe(3);
	expect(result.payload).toEqual({ status: "ok", version: "0.8.3" });
});

test("health polling fails when the budget expires", async () => {
	let clock = 0;
	await expect(
		pollHealth({
			port: 45_000,
			timeoutMs: 1_000,
			intervalMs: 250,
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
			fetch: async () => {
				throw new Error("ECONNREFUSED");
			},
		}),
	).rejects.toThrow(/did not become healthy/);
});

test("a non-2xx health answer is not accepted as a pass", async () => {
	let clock = 0;
	await expect(
		pollHealth({
			port: 45_000,
			timeoutMs: 600,
			intervalMs: 200,
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
			fetch: async () => ({ ok: false, status: 503, json: async () => ({ status: "degraded" }) }),
		}),
	).rejects.toThrow(/HTTP 503/);
});

test("a child that exits fails immediately instead of waiting out the budget", async () => {
	let clock = 0;
	let alive = true;
	let attempts = 0;
	await expect(
		pollHealth({
			port: 45_000,
			// A long budget: the point is that death short-circuits it.
			timeoutMs: 600_000,
			intervalMs: 100,
			now: () => clock,
			sleep: async (ms) => {
				clock += ms;
			},
			isAlive: () => alive,
			fetch: async () => {
				if (++attempts >= 2) alive = false;
				throw new Error("ECONNREFUSED");
			},
		}),
	).rejects.toThrow(/exited before answering/);
	expect(clock).toBeLessThan(10_000);
});

test.each([
	"headers",
	"body",
])("a hung health %s is aborted within the whole-attempt budget", async (phase) => {
	let signal: AbortSignal | undefined;
	const never = new Promise<never>(() => {});
	const started = Date.now();
	await expect(
		pollHealth({
			port: 45_000,
			timeoutMs: 80,
			intervalMs: 1,
			fetch: async (_url, init) => {
				signal = init.signal;
				if (phase === "headers") return never;
				return { ok: true, status: 200, json: () => never };
			},
		}),
	).rejects.toThrow(/did not become healthy/);
	expect(signal?.aborted).toBe(true);
	expect(Date.now() - started).toBeLessThan(2_000);
});

test("the real health transport aborts an unresponsive loopback peer", async () => {
	const sockets = new Set<import("node:net").Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No test port");
	try {
		await expect(pollHealth({ port: address.port, timeoutMs: 80 })).rejects.toThrow(
			/did not become healthy/,
		);
	} finally {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test("stderr is drained continuously with only a bounded tail", async () => {
	let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			streamController = controller;
		},
	});
	const drain = drainSmokeStderr(stream, 128);
	streamController?.enqueue(Buffer.alloc(1024 * 1024, "x"));
	streamController?.enqueue(Buffer.from("TAIL"));
	await Bun.sleep(20);
	expect(Buffer.byteLength(drain.text())).toBe(128);
	expect(drain.text()).toEndWith("TAIL");
	await drain.close(); // No EOF required from a live child/descendant.
});

/** Evaluate only the actual health handler with inert dependencies, never import
 * app.ts (which initializes services). This prevents a mock-only protocol from
 * drifting away from the response the compiled binary really produces. */
function runtimeHealthPayload(version: string, commit: string): Record<string, unknown> {
	const source = readFileSync(join(import.meta.dir, "../../../server/app.ts"), "utf8").replaceAll(
		"\r\n",
		"\n",
	);
	const start = source.indexOf('app.get("/api/health",');
	const end = source.indexOf("\n});", start);
	if (start < 0 || end < 0) throw new Error("Health route extraction failed");
	return runInNewContext(
		`let payload;
		const app = { get: (_path, handler) => { payload = handler({ json: value => value }); } };
		${source.slice(start, end + 4)}
		payload;`,
		{
			APP_VERSION: version,
			GIT_COMMIT: commit,
			gitAvailable: true,
			recheckGit: () => {
				throw new Error("Unexpected git probe");
			},
			getRuntimeEnvironment: () => ({}),
			process: { platform: "win32" },
		},
		{ timeout: 1000 },
	);
}

test.each([
	"healthy",
	"unhealthy",
	"wrong-version",
	"wrong-commit",
	"wrong-commit-field",
	"wrong-commit-suffix",
	"missing-commit",
	"empty-commit",
	"bare-version",
	"extra-suffix",
	"abbreviated-commit",
	"wrong-status",
])("real dummy-child %s launch drains pipes and always reaps the owned child", async (mode) => {
	const root = temp();
	const home = join(root, "home"),
		cwd = join(root, "cwd");
	mkdirSync(home);
	mkdirSync(cwd);
	initializeSmokeHome(home);
	const reservation = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
	const port = reservation.port;
	reservation.stop(true);
	const owned = new OwnedChildren();
	let launched: OwnedChild | undefined;
	const originalTrack = owned.track.bind(owned);
	owned.track = <T extends OwnedChild>(child: T): T => {
		launched = child;
		return originalTrack(child);
	};
	const payload = runtimeHealthPayload(
		mode === "wrong-version" ? "0.0.0" : VERSION,
		mode === "wrong-commit" ? "deadbeef" : BUILD_COMMIT,
	);
	if (mode === "wrong-commit-field") payload.commit = "deadbeef";
	if (mode === "wrong-commit-suffix") payload.version = `${VERSION}+deadbeef`;
	if (mode === "missing-commit") delete payload.commit;
	if (mode === "empty-commit") payload.commit = "";
	if (mode === "bare-version") payload.version = VERSION;
	if (mode === "extra-suffix") payload.version += ".extra";
	if (mode === "abbreviated-commit") {
		payload.version = `${VERSION}+${BUILD_COMMIT.slice(0, 7)}`;
		payload.commit = BUILD_COMMIT.slice(0, 7);
	}
	if (mode === "wrong-status") payload.status = "degraded";
	const command = [
		process.execPath,
		"-e",
		`
		import { homedir } from 'node:os';
		import { strict as assert } from 'node:assert';
		assert.equal(homedir(), process.env.NARRAFORK_HOME);
		assert.equal(process.env.NARRAFORK_ALLOW_MULTIPLE, '1');
		await Bun.write(Bun.stdout, 'x'.repeat(1024 * 1024));
		await Bun.write(Bun.stderr, 'y'.repeat(1024 * 1024) + 'DUMMY_DIAGNOSTIC');
		Bun.serve({ hostname:'127.0.0.1', port:${port}, fetch:()=>Response.json(${JSON.stringify(payload)}, {status:${mode === "unhealthy" ? 503 : 200}}) });
	`,
	];
	try {
		const attempt = runSmokeAttempt(owned, command, {
			home,
			cwd,
			port,
			timeoutMs: 1200,
			version: VERSION,
			commit: BUILD_COMMIT,
			graceMs: 20,
		});
		if (mode === "healthy") {
			const health = await attempt;
			expect(health.status).toBe(200);
			expect(health.payload).toMatchObject({
				status: "ok",
				version: `${VERSION}+${BUILD_COMMIT}`,
				commit: BUILD_COMMIT,
			});
		} else {
			await expect(attempt).rejects.toThrow(
				mode === "unhealthy" ? /did not become healthy/ : /Unexpected/,
			);
			await expect(attempt).rejects.toThrow("DUMMY_DIAGNOSTIC");
		}
		expect(launched).toBeDefined();
		expect(launched?.exitCode !== null || launched?.signalCode != null).toBe(true);
		await launched?.exited;
		expect(owned.size).toBe(0);
	} finally {
		await owned.stopAll(20);
	}
}, 10_000);

/** Controllable stand-in for a spawned process. */
function fakeChild(): OwnedChild & { signals: string[]; finish: (code: number) => void } {
	let resolveExit: (code: number) => void = () => {};
	const exited = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});
	const child = {
		pid: 4242,
		exitCode: null as number | null,
		signals: [] as string[],
		exited,
		kill(signal?: number | NodeJS.Signals) {
			child.signals.push(String(signal ?? "SIGTERM"));
		},
		finish(code: number) {
			child.exitCode = code;
			resolveExit(code);
		},
	};
	return child;
}

test("stopping an owned child asks politely first and resolves on exit", async () => {
	const owned = new OwnedChildren();
	const child = fakeChild();
	owned.track(child);
	expect(owned.size).toBe(1);
	const stopping = owned.stop(child, 60_000);
	await Bun.sleep(5);
	expect(child.signals).toEqual(["SIGTERM"]);
	child.finish(0);
	expect(await stopping).toBe(0);
	expect(owned.size).toBe(0);
});

test("a child that ignores SIGTERM is killed after the grace period", async () => {
	const owned = new OwnedChildren();
	const child = fakeChild();
	owned.track(child);
	const stopping = owned.stop(child, 10);
	await Bun.sleep(40);
	expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
	child.finish(137);
	expect(await stopping).toBe(137);
});

test("shutdown is bounded even if a child never acknowledges SIGKILL", async () => {
	const owned = new OwnedChildren();
	const child = owned.track(fakeChild());
	try {
		await expect(owned.stop(child, 5, 10)).rejects.toThrow("did not exit after SIGKILL");
		expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
		expect(owned.size).toBe(1); // Keep ownership for the synchronous exit fallback.
	} finally {
		child.finish(137);
	}
});

test("signal termination is an exit even when Bun reports a null exitCode", async () => {
	const owned = new OwnedChildren();
	const child = { ...fakeChild(), signalCode: "SIGTERM" };
	await owned.stop(child);
	expect(child.signals).toEqual([]);
});

test("a process this run does not own is never signalled", async () => {
	const owned = new OwnedChildren();
	const foreign = fakeChild();
	// No global kill, and no touching an already running NarraFork instance.
	await expect(owned.stop(foreign)).rejects.toThrow(/does not own/);
	expect(foreign.signals).toEqual([]);
});

test("every owned child is reaped on an abrupt exit path", () => {
	const owned = new OwnedChildren();
	const first = fakeChild();
	const second = fakeChild();
	owned.track(first);
	owned.track(second);
	owned.killAllNow();
	expect(first.signals).toEqual(["SIGKILL"]);
	expect(second.signals).toEqual(["SIGKILL"]);
	expect(owned.size).toBe(0);
});

test("stopAll reaps the whole registry", async () => {
	const owned = new OwnedChildren();
	const children = [fakeChild(), fakeChild()];
	for (const child of children) owned.track(child);
	const stopping = owned.stopAll(10);
	await Bun.sleep(5);
	for (const child of children) child.finish(0);
	await stopping;
	expect(owned.size).toBe(0);
	for (const child of children) expect(child.signals[0]).toBe("SIGTERM");
});

test("an already exited child is dropped without a signal", async () => {
	const owned = new OwnedChildren();
	const child = fakeChild();
	owned.track(child);
	child.finish(0);
	expect(await owned.stop(child)).toBe(0);
	expect(child.signals).toEqual([]);
});
