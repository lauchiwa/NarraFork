/**
 * Exercise the actual reclamation owner and startup wiring without importing main
 * (which initializes the app/DB). Only the named source regions are transpiled;
 * all OS operations, binding, exit and logging are fixture dependencies in a VM.
 * No real netstat/taskkill, process signalling, listener or product startup occurs.
 * Keeping the guard in the owner is tested separately from the startup caller.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

const main = readFileSync(join(import.meta.dir, "../../main.ts"), "utf8");
function region(start: string, end: string): string {
	const first = main.indexOf(start);
	const last = main.indexOf(end, first + start.length);
	if (first < 0 || last < 0 || main.indexOf(start, first + start.length) >= 0)
		throw new Error(`Startup source boundary moved: ${start} / ${end}`);
	return main.slice(first, last);
}

const reclaim = region("function tryReclaimPort(", "function getWindowsChildProcesses(");
const cli = region("const cliPort =", "let configuredHost =");
const startup = region("let actualPort = port;", "\nlogger.info(`NarraFork server running");
const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
const reclaimJs = transpiler.transformSync(`${reclaim}\ntryReclaimPort(45000);`);
const startupJs = transpiler.transformSync(
	`${reclaim}\n${cli}\n${startup}\nglobalThis.fixturePort = actualPort;`,
);
const exit = new Error("fixture process.exit");

function fixture(
	argv: string[],
	options: { windows?: boolean; busy?: boolean; ghost?: boolean; bindError?: unknown } = {},
) {
	const commands: string[][] = [];
	const sleeps: number[] = [];
	const binds: number[] = [];
	const exits: number[] = [];
	const logs: string[] = [];
	const log = (message: string) => logs.push(message);
	const globals = {
		IS_WINDOWS: options.windows ?? true,
		TextDecoder,
		Bun: {
			spawnSync(command: string[]) {
				commands.push(command);
				if (command[0] === "netstat") {
					return {
						exitCode: 0,
						stdout: Buffer.from(
							[
								"TCP 0.0.0.0:45000 0.0.0.0:0 LISTENING 4242",
								"TCP [::]:45000 [::]:0 LISTENING 4242", // Duplicate PID.
								"TCP 0.0.0.0:45001 0.0.0.0:0 LISTENING 4243", // Other port.
								"TCP 0.0.0.0:45000 0.0.0.0:0 ESTABLISHED 4244",
								"TCP 0.0.0.0:45000 0.0.0.0:0 LISTENING 9000", // Own PID.
							].join("\n"),
						),
					};
				}
				if (command[0] === "taskkill") {
					return {
						exitCode: options.ghost ? 1 : 0,
						stderr: Buffer.from(options.ghost ? "process not found" : ""),
					};
				}
				if (command[0] === "wmic") return { exitCode: 0, stdout: Buffer.from("") };
				throw new Error(`Unexpected fixture command: ${command.join(" ")}`);
			},
			sleepSync: (ms: number) => sleeps.push(ms),
		},
		process: {
			argv,
			env: {},
			pid: 9000,
			exit(code: number) {
				exits.push(code);
				throw exit;
			},
		},
		logger: { warn: log, info: log, error: log },
		console: { warn: log, error: log },
		settings: { server: { port: 45000 } },
		MAX_PORT_RETRIES: 10,
		readWindowsExcludedPortRanges: () => [],
		findExcludingRange: () => undefined,
		nextAllowedPort: (port: number) => port,
		startServerWithHostFallback(port: number) {
			binds.push(port);
			if (port === 45000 && "bindError" in options) throw options.bindError;
			if (options.busy && port === 45000) throw new Error("EADDRINUSE");
			return { port };
		},
	};
	return {
		commands,
		sleeps,
		binds,
		exits,
		logs,
		reclaim: () => runInNewContext(reclaimJs, globals, { timeout: 1000 }),
		start: () => runInNewContext(startupJs, globals, { timeout: 1000 }),
	};
}

const normalCommands = [
	["netstat", "-ano"],
	["taskkill", "/T", "/F", "/PID", "4242"],
];

test.each(
	[
		["--no-port-reclaim"],
		["narrafork.exe", "--no-port-reclaim", "--port=45000"],
		["narrafork.exe", "--port=45000", "--no-port-reclaim", "--no-port-reclaim"],
	].map((argv) => ({ argv })),
)("the reclamation owner itself refuses every OS call with argv %p", ({ argv }) => {
	const f = fixture(argv, { ghost: true });
	f.reclaim(); // Direct call, not protected only by the startup caller.
	expect(f.commands).toEqual([]);
	expect(f.sleeps).toEqual([]);
	expect(f.logs).toEqual([]);
});

test.each(
	[
		[],
		["--no-auto-resume"],
		["--no-port-reclaim=false"],
		["--no-port-reclaim=true"],
		["--no-port-reclaimer"],
		["--no-port-reclaim-extra"],
		["--NO-PORT-RECLAIM"],
		["--other=--no-port-reclaim"],
	].map((argv) => ({ argv })),
)("ordinary and similarly named argv %p retain the existing reclamation behavior", ({ argv }) => {
	const f = fixture(argv);
	f.reclaim();
	expect(f.commands).toEqual(normalCommands);
	expect(f.sleeps).toEqual([300, 200]);
});

test("the default ghost-holder branch still performs its existing process-tree probes", () => {
	const f = fixture([], { ghost: true });
	f.reclaim();
	expect(f.commands.slice(0, 2)).toEqual(normalCommands);
	expect(f.commands.slice(2)).toEqual([
		[
			"wmic",
			"process",
			"where",
			"(ParentProcessId=4242)",
			"get",
			"Caption,ProcessId",
			"/FORMAT:CSV",
		],
		["wmic", "process", "where", "(ProcessId=4242)", "get", "ParentProcessId", "/FORMAT:CSV"],
	]);
});

test.each(
	[[], ["--no-port-reclaim"]].map((argv) => ({ argv })),
)("non-Windows remains a no-op with argv %p", ({ argv }) => {
	const f = fixture(argv, { windows: false });
	f.reclaim();
	expect(f.commands).toEqual([]);
	expect(f.sleeps).toEqual([]);
});

test("actual startup wiring reaches the guarded owner before binding an explicit port", () => {
	const f = fixture(["narrafork.exe", "--no-port-reclaim", "--port=45000"]);
	expect(f.start()).toBe(45000);
	expect(f.commands).toEqual([]);
	expect(f.binds).toEqual([45000]);
	expect(f.exits).toEqual([]);
});

test.each([
	{ shape: "legacy code message", error: new Error("EADDRINUSE") },
	{ shape: "legacy address message", error: new Error("address already in use") },
	{
		// Bun 1.4.2 Windows reports the code separately from this message.
		shape: "Bun structured bind error",
		error: Object.assign(new Error("Failed to start server. Is port 45000 in use?"), {
			code: "EADDRINUSE",
			syscall: "listen",
			errno: 0,
		}),
	},
])("an explicit smoke port collision ($shape) exits without reclaiming or moving port", ({
	error,
}) => {
	const f = fixture(["narrafork.exe", "--port=45000", "--no-port-reclaim"], { bindError: error });
	expect(() => f.start()).toThrow("fixture process.exit");
	expect(f.commands).toEqual([]);
	expect(f.sleeps).toEqual([]);
	expect(f.binds).toEqual([45000]);
	expect(f.exits).toEqual([1]);
	expect(f.logs.some((log) => log.includes("already in use"))).toBe(true);
});

test.each([
	{ shape: "unrelated Error", error: new Error("fixture bind failure") },
	{
		shape: "same Bun message but unrelated code",
		error: Object.assign(new Error("Failed to start server. Is port 45000 in use?"), {
			code: "EACCES",
		}),
	},
	{ shape: "non-string code", error: { code: 1 } },
	{ shape: "missing code", error: {} },
	{ shape: "null", error: null },
	{ shape: "undefined", error: undefined },
	{ shape: "string", error: "fixture bind failure" },
])("an unrelated explicit-port failure ($shape) propagates unchanged", ({ error }) => {
	const f = fixture(["narrafork.exe", "--port=45000", "--no-port-reclaim"], { bindError: error });
	let caught = false;
	try {
		f.start();
	} catch (actual) {
		caught = true;
		expect(actual).toBe(error);
	}
	expect(caught).toBe(true);
	expect(f.commands).toEqual([]);
	expect(f.sleeps).toEqual([]);
	expect(f.binds).toEqual([45000]);
	expect(f.exits).toEqual([]);
	expect(f.logs).toEqual([]);
});

test("ordinary startup still invokes reclamation and binds the requested port", () => {
	const f = fixture(["narrafork.exe", "--port=45000"]);
	expect(f.start()).toBe(45000);
	expect(f.commands).toEqual(normalCommands);
	expect(f.binds).toEqual([45000]);
});

test("the opt-out does not change the existing fallback rule for a non-explicit port", () => {
	const f = fixture(["narrafork.exe", "--no-port-reclaim"], { busy: true });
	expect(f.start()).toBe(45001);
	expect(f.commands).toEqual([]);
	expect(f.binds).toEqual([45000, 45001]);
	expect(f.exits).toEqual([]);
});
