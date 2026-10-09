/**
 * Bounded startup smoke test for a freshly built NarraFork binary.
 *
 * This module holds the decidable logic so it can be unit tested without
 * launching a server; `scripts/smoke-self-build.ts` is the thin entry point the
 * self-build workflow calls.
 *
 * Deliberate limits, because a build host can only prove so much:
 *
 *  - Only targets the CURRENT host can execute are started ({@link hostRunnableTargets}).
 *    A cross-compiled artifact is verified by identity/metadata checks elsewhere;
 *    nothing here may be read as "that architecture ran".
 *  - Every target gets a NEW home (reused on repeat startup) and a clean CWD, so the
 *    binary is forced through its EMBEDDED migrations and never reaches the
 *    developer's real data directory.
 *  - Only children this process started are ever signalled ({@link OwnedChildren}).
 *    No global kill, no touching an already running instance.
 *  - No provider credential is forwarded and no model request is made
 *    ({@link smokeEnv}); the probe is `GET /api/health` only.
 */
import { lstatSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { isAbsolute, join } from "node:path";
import type { BinaryMetadata } from "./binary-metadata";
import {
	assertBinaryMetadata,
	assertIdentityMatchesMetadata,
	type ExpectedBinaryIdentity,
	fileIdentity,
	MAX_BINARY_BYTES,
	MAX_METADATA_BYTES,
	readTextAsset,
} from "./build-artifact-identity";
import { type BuildTarget, binaryName, targetsForFamily } from "./build-targets";

/** Inherit OS/tool lookup only, never provider, database, restart or proxy settings.
 * Match case-insensitively because Windows environment keys are case-insensitive. */
const OS_ENV =
	/^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|LANG|LC_[A-Z_]+|TZ|OS|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i;

/**
 * Targets the current host can natively execute.
 *
 * x64 hosts also run the `x64-baseline` variant: baseline is a CPU-feature
 * subset of the same OS/arch, so it is genuinely host-runnable. Rosetta and
 * emulation are NOT assumed — a darwin-arm64 host does not claim darwin-x64.
 */
export function hostRunnableTargets(
	platform: string = process.platform,
	arch: string = process.arch,
): BuildTarget[] {
	const family =
		platform === "darwin"
			? "darwin"
			: platform === "win32"
				? "windows"
				: platform === "linux"
					? "linux"
					: undefined;
	if (!family) return [];
	const expected =
		family === "windows"
			? arch === "arm64"
				? ["win-arm64"]
				: arch === "x64"
					? ["win-x64", "win-x64-baseline"]
					: []
			: family === "darwin"
				? arch === "arm64"
					? ["darwin-arm64"]
					: arch === "x64"
						? ["darwin-x64"]
						: []
				: arch === "arm64"
					? ["linux-arm64"]
					: arch === "x64"
						? ["linux-x64", "linux-x64-baseline"]
						: [];
	return targetsForFamily(family).filter((target) => expected.includes(target.platformId));
}

/** Resolved binary path for a host-runnable target inside `distDir`. */
export const smokeBinaryPath = (distDir: string, version: string, target: BuildTarget): string =>
	join(distDir, binaryName(version, target));

export interface SmokeBuildIdentity {
	/** package.json version, not the health response's composite version. */
	version: string;
	/** Exact build commit from a sidecar verified against the full source SHA. */
	commit: string;
}

/** Bind health expectations to source and artifact bytes BEFORE launching anything.
 * Reuse the output checker's bounded reads, provenance and streaming hash checks. */
export async function verifySmokeBinary(
	binary: string,
	expected: ExpectedBinaryIdentity,
): Promise<SmokeBuildIdentity> {
	const metadata: BinaryMetadata = JSON.parse(
		await readTextAsset(`${binary}.metadata.json`, MAX_METADATA_BYTES),
	);
	assertBinaryMetadata(metadata, expected, binary);
	assertIdentityMatchesMetadata(await fileIdentity(binary, MAX_BINARY_BYTES), metadata, binary);
	return { version: expected.version, commit: metadata.commit };
}

/**
 * Environment for a smoke launch: isolated home, no inherited listener settings,
 * no credentials.
 */
export function smokeEnv(
	home: string,
	base: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Record<string, string> {
	if (!isAbsolute(home)) throw new Error("Smoke home must be absolute");
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(base)) {
		if (value !== undefined && OS_ENV.test(key)) env[key] = value;
	}
	// Also isolate consumers of os.homedir(), XDG and Windows app-data paths.
	env.HOME = home;
	env.USERPROFILE = home;
	env.APPDATA = join(home, "AppData", "Roaming");
	env.LOCALAPPDATA = join(home, "AppData", "Local");
	env.XDG_CONFIG_HOME = join(home, ".config");
	env.XDG_CACHE_HOME = join(home, ".cache");
	env.XDG_DATA_HOME = join(home, ".local", "share");
	env.XDG_RUNTIME_DIR = join(home, ".run");
	env.NARRAFORK_HOME = home;
	env.NARRAFORK_ALLOW_MULTIPLE = "1";
	env.NF_DATABASE_BACKEND = "sqlite";
	env.NF_PLUGINS_ENABLED = "0";
	env.NODE_ENV = "production";
	return env;
}

/** Only call for this run's newly created home, never on repeat startup. */
export function initializeSmokeHome(home: string): void {
	if (!isAbsolute(home)) throw new Error("Smoke home must be absolute");
	writeFileSync(
		join(home, "settings.json"),
		JSON.stringify({
			server: { openBrowser: "off" },
			update: { checkIntervalMinutes: 0, autoDownload: false },
			plugins: { enabled: false },
			vnet: { enabled: false, udp: { enabled: false } },
			containers: { proxy: { enabled: false } },
		}),
		{ flag: "wx" },
	);
}

/**
 * Launch argv for a bounded probe.
 *
 * `--no-auto-resume` keeps the approval/recovery list intact without executing
 * anything; `--host=127.0.0.1` keeps the listener on loopback. `--no-port-reclaim`
 * forbids killing a listener that races our released port reservation; the explicit
 * port must fail on collision, not silently move to another port.
 */
export function smokeArgs(binary: string, port: number): string[] {
	if (!Number.isInteger(port) || port < 1024 || port > 65535)
		throw new Error(`Smoke port out of range: ${port}`);
	return [binary, "--no-auto-resume", "--no-port-reclaim", `--port=${port}`, "--host=127.0.0.1"];
}

export const healthUrl = (port: number): string => `http://127.0.0.1:${port}/api/health`;

/** The binary must rely on embedded migrations, so the CWD may not shadow them. */
export function assertCleanWorkdir(cwd: string): void {
	for (const name of ["drizzle", "drizzle-postgres"]) {
		let exists = true;
		try {
			lstatSync(join(cwd, name));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			exists = false;
		}
		if (exists)
			throw new Error(
				`Smoke CWD must not contain ./${name}: the binary would prefer it over its embedded migrations`,
			);
	}
}

export interface HealthPollOptions {
	port: number;
	/** Whole-attempt budget in milliseconds. */
	timeoutMs: number;
	intervalMs?: number;
	/** Abort early when the child is already gone; avoids waiting out the budget. */
	isAlive?: () => boolean;
	/** Per-request budget includes receiving the JSON body. */
	requestTimeoutMs?: number;
	fetch?: (
		url: string,
		init: { signal: AbortSignal },
	) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface HealthResult {
	status: number;
	payload: unknown;
	attempts: number;
	elapsedMs: number;
}

/** node:http bypasses ambient proxies (Bun fetch may proxy even loopback).
 * Bound the entire response, including non-2xx bodies; abort covers socket and body. */
function fetchLoopbackHealth(url: string, { signal }: { signal: AbortSignal }) {
	return new Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>(
		(resolve, reject) => {
			const request = get(url, { signal, agent: false }, (response) => {
				const chunks: Buffer[] = [];
				let size = 0;
				response.on("error", reject);
				response.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > 64 * 1024) {
						request.destroy(new Error("Health response exceeds byte limit"));
						return;
					}
					chunks.push(chunk);
				});
				response.on("end", () => {
					const status = response.statusCode ?? 0;
					resolve({
						ok: status >= 200 && status < 300,
						status,
						json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
					});
				});
			});
			request.on("error", reject);
		},
	);
}

/**
 * Poll `/api/health` until it answers, the child dies, or the budget expires.
 *
 * Connection refusals are expected while the server boots and are retried; a
 * dead child or an exhausted budget is a failure, never a pass.
 */
export async function pollHealth(options: HealthPollOptions): Promise<HealthResult> {
	const interval = options.intervalMs ?? 500;
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? ((ms: number) => Bun.sleep(ms));
	const doFetch = options.fetch ?? fetchLoopbackHealth;
	const url = healthUrl(options.port);
	const started = now();
	let attempts = 0;
	let lastError = "no attempt completed";
	while (now() - started < options.timeoutMs) {
		if (options.isAlive && !options.isAlive())
			throw new Error(`Smoke target exited before answering ${url} (last error: ${lastError})`);
		attempts++;
		const controller = new AbortController();
		const budget = Math.min(
			options.requestTimeoutMs ?? 5_000,
			options.timeoutMs - (now() - started),
		);
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const result = await Promise.race([
				(async () => {
					const response = await doFetch(url, { signal: controller.signal });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					return { status: response.status, payload: await response.json() };
				})(),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => {
						controller.abort();
						reject(new Error("Health request deadline exceeded"));
					}, budget);
				}),
			]);
			if (options.isAlive && !options.isAlive()) throw new Error("Smoke target exited");
			if (now() - started >= options.timeoutMs) throw new Error("Health deadline exceeded");
			return { ...result, attempts, elapsedMs: now() - started };
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		} finally {
			clearTimeout(timer);
			controller.abort(); // Release non-2xx bodies and timed-out requests too.
		}
		await sleep(Math.max(0, Math.min(interval, options.timeoutMs - (now() - started))));
	}
	throw new Error(
		`Smoke target did not become healthy at ${url} within ${options.timeoutMs}ms ` +
			`after ${attempts} attempt(s) (last error: ${lastError})`,
	);
}

/** Drain while the child runs; retain only a bounded diagnostic tail, never await EOF
 * before stopping the child. Cancellation also handles a descendant holding the pipe. */
export function drainSmokeStderr(stream: ReadableStream<Uint8Array>, maxBytes = 16 * 1024) {
	const reader = stream.getReader();
	let tail = Buffer.alloc(0);
	const done = (async () => {
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				tail = Buffer.concat([tail, Buffer.from(value.subarray(-maxBytes))]).subarray(-maxBytes);
			}
		} catch {
			// A stopped child's pipe may report cancellation rather than EOF.
		} finally {
			reader.releaseLock();
		}
	})();
	return {
		text: () => tail.toString("utf8"),
		async close() {
			await reader.cancel().catch(() => {});
			await done;
		},
	};
}

/** Shared real launch path; tests use a dummy executable, never the application. */
export async function runSmokeAttempt(
	owned: OwnedChildren,
	command: string[],
	options: SmokeBuildIdentity & {
		home: string;
		cwd: string;
		port: number;
		timeoutMs: number;
		graceMs?: number;
	},
): Promise<HealthResult> {
	if (!/^[a-f0-9]{7,40}$/.test(options.commit))
		throw new Error("Smoke requires a verified build commit");
	// server/app.ts adds the exact build commit to APP_VERSION, and also returns
	// it separately. Neither expectation may be inferred from the response itself.
	const healthVersion = `${options.version}+${options.commit}`;
	assertCleanWorkdir(options.cwd);
	const child = owned.track(
		Bun.spawn(command, {
			cwd: options.cwd,
			env: smokeEnv(options.home),
			stdout: "ignore",
			stderr: "pipe",
			stdin: "ignore",
		}),
	);
	const stderr = drainSmokeStderr(child.stderr);
	try {
		const health = await pollHealth({
			port: options.port,
			timeoutMs: options.timeoutMs,
			isAlive: () => !childHasExited(child),
		});
		const payload = health.payload as Record<string, unknown> | null;
		if (
			payload?.status !== "ok" ||
			payload.version !== healthVersion ||
			payload.commit !== options.commit
		)
			throw new Error(
				`Unexpected /api/health payload (expected version ${healthVersion}, commit ${options.commit}): ${JSON.stringify(payload).slice(0, 400)}`,
			);
		return health;
	} catch (cause) {
		throw new Error(
			`${cause instanceof Error ? cause.message : String(cause)}\n--- child stderr (tail) ---\n${stderr.text()}`,
			{ cause },
		);
	} finally {
		try {
			await owned.stop(child, options.graceMs);
		} finally {
			await stderr.close();
		}
	}
}

/** Minimal view of a spawned child, so tests can substitute a fake. */
export interface OwnedChild {
	pid?: number;
	killed?: boolean;
	exitCode: number | null;
	/** Bun leaves exitCode null on signal termination, including Windows. */
	signalCode?: string | null;
	kill(signal?: number | NodeJS.Signals): void;
	exited: Promise<number>;
}

const childHasExited = (child: OwnedChild) => child.exitCode !== null || child.signalCode != null;

/**
 * Registry of children THIS process started.
 *
 * Shutdown is graceful first (SIGTERM, then SIGKILL after a grace period) and
 * every exit path reaps the registry, so an aborted job does not leave a server
 * holding a port or a data-directory lock. Nothing outside the registry is ever
 * signalled.
 */
export class OwnedChildren {
	private readonly children = new Set<OwnedChild>();

	track<T extends OwnedChild>(child: T): T {
		this.children.add(child);
		void child.exited.then(() => this.children.delete(child)).catch(() => {});
		return child;
	}

	get size(): number {
		return this.children.size;
	}

	/** Terminate one owned child; resolves once it has actually exited. */
	async stop(child: OwnedChild, graceMs = 15_000, killWaitMs = 5_000): Promise<number> {
		if (!this.children.has(child) && !childHasExited(child))
			throw new Error("Refusing to signal a process this smoke run does not own");
		if (!childHasExited(child)) {
			try {
				child.kill("SIGTERM");
			} catch {
				// Already gone between the check and the signal.
			}
			const timer = setTimeout(() => {
				try {
					if (!childHasExited(child)) child.kill("SIGKILL");
				} catch {}
			}, graceMs);
			let deadline: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					child.exited,
					new Promise<never>((_, reject) => {
						deadline = setTimeout(
							() => reject(new Error(`Owned smoke child ${child.pid} did not exit after SIGKILL`)),
							graceMs + killWaitMs,
						);
					}),
				]);
			} finally {
				clearTimeout(timer);
				clearTimeout(deadline);
			}
		}
		this.children.delete(child);
		return child.exitCode ?? 0;
	}

	/** Reap everything still running; safe to call from any exit path. */
	async stopAll(graceMs = 5_000): Promise<void> {
		const results = await Promise.allSettled(
			[...this.children].map((child) => this.stop(child, graceMs)),
		);
		const failures = results.filter((result) => result.status === "rejected");
		if (failures.length)
			throw new AggregateError(
				failures.map((result) => result.reason),
				"Failed to stop owned smoke children",
			);
	}

	/** Synchronous best effort for `process.on("exit")`, which cannot await. */
	killAllNow(): void {
		for (const child of this.children) {
			try {
				if (!childHasExited(child)) child.kill("SIGKILL");
			} catch {}
		}
		this.children.clear();
	}
}
