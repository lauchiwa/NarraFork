// biome-ignore-all lint/suspicious/noTemplateCurlyInString: `${{ ... }}` is GitHub
// Actions expression syntax that these assertions must match literally, not a
// JavaScript template placeholder.
/**
 * Structure guards for `.github/workflows/build-self.yml`.
 *
 * The workflow's safety properties are not observable from a local test run, so
 * they are asserted against the PARSED document: source identity, read-only
 * permissions, gate ordering, the full eight-target matrix, and the absence of
 * any publish/push/secret step. String matching alone would pass on a commented
 * out step, so every assertion below navigates the parsed structure.
 *
 * The target counts are derived from `scripts/lib/build-targets.ts` rather than
 * restated, so a second divergent target list cannot be introduced silently.
 */
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
	BUILD_FAMILIES,
	BUILD_TARGETS,
	type BuildFamily,
	targetsForFamily,
} from "../../scripts/lib/build-targets";
import {
	archiveName,
	checksumsReportName,
	sha256SumsName,
} from "../../scripts/lib/self-build-check";

const ROOT = resolve(import.meta.dir, "../..");
const WORKFLOW_PATH = join(ROOT, ".github/workflows/build-self.yml");
const source = readFileSync(WORKFLOW_PATH, "utf8");

interface Step {
	name?: string;
	uses?: string;
	run?: string;
	with?: Record<string, unknown>;
	"timeout-minutes"?: number;
}
interface Job {
	name?: string;
	"runs-on": string;
	"timeout-minutes"?: number;
	needs?: string | string[];
	if?: string;
	outputs?: Record<string, string>;
	strategy?: { "fail-fast"?: boolean; matrix?: { include?: Record<string, unknown>[] } };
	steps: Step[];
}
interface Workflow {
	name: string;
	on: Record<string, unknown>;
	permissions: Record<string, string>;
	defaults?: { run?: { shell?: string } };
	jobs: Record<string, Job>;
}

const workflow = Bun.YAML.parse(source) as Workflow;
const jobs = workflow.jobs;
const steps = (job: string): Step[] => jobs[job].steps;
const needsOf = (job: string): string[] => {
	const needs = jobs[job].needs;
	return needs === undefined ? [] : Array.isArray(needs) ? needs : [needs];
};
const allSteps = (): Step[] => Object.values(jobs).flatMap((job) => job.steps);

test("the workflow parses and declares exactly the three expected jobs", () => {
	expect(Object.keys(jobs).sort()).toEqual(["build", "summary", "validate"]);
});

test("the only trigger is manual dispatch", () => {
	// A push/schedule/pull_request trigger would build unreviewed refs automatically.
	expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
	// No inputs: the ref comes from GitHub's own branch/tag selector, so no user
	// supplied string is ever interpolated into a shell command.
	expect(workflow.on.workflow_dispatch ?? null).toBeNull();
});

test("permissions are read-only on contents and nothing else", () => {
	expect(workflow.permissions).toEqual({ contents: "read" });
});

test("every job is bounded by a timeout", () => {
	for (const [name, job] of Object.entries(jobs)) {
		expect(typeof job["timeout-minutes"]).toBe("number");
		expect(job["timeout-minutes"]).toBeGreaterThan(0);
		expect(job["timeout-minutes"]).toBeLessThanOrEqual(120);
		expect(name).toBeTruthy();
	}
});

test("shell is explicitly bash, so Windows steps do not depend on PowerShell semantics", () => {
	expect(workflow.defaults?.run?.shell).toBe("bash");
	// No step may silently opt back out of it.
	for (const step of allSteps()) expect(step.with?.shell).toBeUndefined();
});

test("each checkout pins this repository's triggering commit without credentials", () => {
	const checkouts = allSteps().filter((step) => step.uses?.startsWith("actions/checkout"));
	expect(checkouts.length).toBe(2);
	for (const step of checkouts) {
		expect(step.uses).toBe("actions/checkout@v4");
		expect(step.with?.ref).toBe("${{ github.sha }}");
		expect(step.with?.["persist-credentials"]).toBe(false);
		// No upstream/foreign source: a `repository:` override would defeat the
		// entire point of building this repository's own code.
		expect(step.with?.repository).toBeUndefined();
		expect(step.with?.token).toBeUndefined();
		expect(step.with?.submodules).toBeUndefined();
	}
});

test("Bun is pinned to the version in packageManager, never 'latest'", () => {
	const pinned: string = JSON.parse(
		readFileSync(join(ROOT, "package.json"), "utf8"),
	).packageManager;
	expect(pinned).toBe("bun@1.4.2");
	const setups = allSteps().filter((step) => step.uses?.startsWith("oven-sh/setup-bun"));
	expect(setups.length).toBe(2);
	for (const step of setups) {
		expect(step.uses).toBe("oven-sh/setup-bun@v2");
		expect(String(step.with?.["bun-version"])).toBe("1.4.2");
	}
	for (const step of allSteps()) {
		if (step.run?.includes("bun install"))
			expect(step.run).toContain("bun install --frozen-lockfile");
	}
});

test("the validate gate checks committed inputs and drift before anything builds", () => {
	const runs = steps("validate").map((step) => step.run ?? "");
	expect(runs.some((run) => run.includes("check-self-build.ts --mode=input"))).toBe(true);
	expect(runs.some((run) => run.includes("check-self-build.ts --mode=drift"))).toBe(true);
	// Focused suites, run isolated per docs/TESTING.md.
	const tests = runs.find((run) => run.includes("bun test"));
	expect(tests).toContain("--isolate");
	for (const file of [
		"scripts/lib/__tests__/self-build-check.test.ts",
		"scripts/lib/__tests__/self-build-smoke.test.ts",
		"scripts/lib/__tests__/bootstrap-sqlite-migrations.test.ts",
		"server/db/__tests__/self-build-migration-baseline.test.ts",
		"server/lib/__tests__/startup-port-reclaim.test.ts",
		"tests/workflows/build-self.test.ts",
	])
		expect(tests).toContain(file);
});

test("build and summary depend on the validate gate", () => {
	expect(needsOf("build")).toContain("validate");
	expect(needsOf("summary")).toEqual(["validate", "build"]);
	// The gate job must state the outcome even when a family failed.
	expect(jobs.summary.if).toBe("always()");
	expect(jobs.build.if).toBeUndefined();
});

test("the matrix covers all eight targets exactly once, in three families", () => {
	const include = jobs.build.strategy?.matrix?.include ?? [];
	expect(jobs.build.strategy?.["fail-fast"]).toBe(false);
	expect(include.length).toBe(BUILD_FAMILIES.length);
	const families = include.map((entry) => entry.family as BuildFamily);
	expect(families.slice().sort()).toEqual([...BUILD_FAMILIES].sort());

	let total = 0;
	for (const entry of include) {
		const family = entry.family as BuildFamily;
		const expected = targetsForFamily(family);
		// The declared count must equal the authoritative table, not a copy of it.
		expect(entry.targets).toBe(expected.length);
		total += expected.length;
		// Each family builds on its own OS: cross-compiling darwin elsewhere would
		// make native ad-hoc signing and the host smoke test impossible.
		expect(entry.runner).toBe(
			family === "linux"
				? "ubuntu-latest"
				: family === "windows"
					? "windows-latest"
					: "macos-latest",
		);
		// The upload path is derived from the same helper that names the archive.
		expect(`narrafork-1.2.3-${entry.archive_suffix}`).toBe(archiveName("1.2.3", family));
	}
	expect(total).toBe(BUILD_TARGETS.length);
	expect(total).toBe(8);
});

test("each family builds only its own allowlisted platform, in strict mode", () => {
	const build = steps("build").map((step) => step.run ?? "");
	const compile = build.find((run) => run.includes("build-cross-platform.ts"));
	expect(compile).toContain("--platform=${{ matrix.family }}");
	expect(compile).toContain("--strict");
	// No release path: scripts/release.ts bumps versions, tags and uploads.
	expect(source).not.toContain("scripts/release.ts");
	for (const run of build) expect(run).not.toContain("--platform=all");
});

test("verification, packaging and smoke all precede the upload step", () => {
	const names = steps("build").map((step) => step.run ?? step.uses ?? "");
	const index = (needle: string) => names.findIndex((entry) => entry.includes(needle));
	const verify = index("check-self-build.ts --mode=package");
	const smoke = index("smoke-self-build.ts");
	const upload = index("actions/upload-artifact");
	expect(index("build-cross-platform.ts")).toBeGreaterThanOrEqual(0);
	expect(verify).toBeGreaterThan(index("build-cross-platform.ts"));
	expect(smoke).toBeGreaterThan(verify);
	// An artifact must never be published before its family passed every check.
	expect(upload).toBeGreaterThan(smoke);
});

test("the upload names an exact artifact set, distinguishes runs, and expires", () => {
	const upload = steps("build").find((step) => step.uses?.startsWith("actions/upload-artifact"));
	expect(upload?.uses).toBe("actions/upload-artifact@v4");
	const name = String(upload?.with?.name);
	// Version, family, source commit, run and attempt: repeated runs of the same
	// commit cannot collide or overwrite each other.
	for (const fragment of [
		"${{ needs.validate.outputs.version }}",
		"${{ matrix.family }}",
		"${{ needs.validate.outputs.short_sha }}",
		"${{ github.run_id }}",
		"${{ github.run_attempt }}",
	])
		expect(name).toContain(fragment);
	expect(upload?.with?.["retention-days"]).toBe(14);
	// A family that produced nothing must fail rather than upload an empty artifact.
	expect(upload?.with?.["if-no-files-found"]).toBe("error");

	const paths = String(upload?.with?.path)
		.trim()
		.split("\n")
		.map((line) => line.trim());
	expect(paths).toEqual([
		"dist/narrafork-${{ needs.validate.outputs.version }}-${{ matrix.archive_suffix }}",
		`dist/${sha256SumsName("${{ needs.validate.outputs.version }}")}`,
		`dist/${checksumsReportName("${{ needs.validate.outputs.version }}")}`,
	]);
	// The frontend build tree, databases and logs are never uploaded.
	for (const path of paths) expect(path.includes("*")).toBe(false);
});

test("every job isolates the NarraFork data directory before running scripts", () => {
	for (const job of ["validate", "build"]) {
		const jobSteps = steps(job);
		const isolate = jobSteps.findIndex((step) => step.run?.includes("NARRAFORK_HOME="));
		expect(isolate).toBeGreaterThanOrEqual(0);
		expect(jobSteps[isolate].run).toContain("$RUNNER_TEMP");
		// Nothing may invoke a repository script before the home is redirected.
		const firstScript = jobSteps.findIndex((step) => /bun scripts\//.test(step.run ?? ""));
		expect(firstScript).toBeGreaterThan(isolate);
	}
});

test("the smoke step exists per family and is separately bounded", () => {
	const smoke = steps("build").find((step) => step.run?.includes("smoke-self-build.ts"));
	expect(smoke?.run).toContain("--family=${{ matrix.family }}");
	expect(typeof smoke?.["timeout-minutes"]).toBe("number");
});

test("eight-target success is claimed only when validate and all families succeeded", () => {
	const gate = steps("summary")
		.map((step) => step.run ?? "")
		.join("\n");
	expect(gate).toContain("needs.validate.result");
	expect(gate).toContain("needs.build.result");
	// Explicit non-zero exit on anything short of a complete run.
	expect(gate).toContain("exit 1");
	expect(gate).toMatch(/PARTIAL OR FAILED RUN/);
	// The claim itself is guarded, not printed unconditionally.
	const claim = gate.indexOf("All three families passed");
	expect(claim).toBeGreaterThan(gate.indexOf("exit 1"));
});

test("no step publishes, pushes, tags, or consumes a secret", () => {
	for (const step of allSteps()) {
		const run = step.run ?? "";
		expect(run).not.toMatch(/\bgit (push|tag|commit|merge)\b/);
		expect(run).not.toMatch(/\bgh (release|pr) \b/);
		expect(step.uses ?? "").not.toMatch(/release|publish|deploy/i);
	}
	// No secret context at all: no token, no update-server credential.
	expect(source).not.toContain("secrets.");
	expect(source).not.toContain("GH_TOKEN");
	expect(source).not.toContain("NPM_TOKEN");
	// Only first-party actions, each pinned to a major tag already used in this repo.
	const uses = allSteps()
		.map((step) => step.uses)
		.filter((value): value is string => Boolean(value));
	expect(uses.every((value) => /^(actions|oven-sh)\//.test(value))).toBe(true);
	expect(uses.every((value) => value.includes("@"))).toBe(true);
});

test("the workflow does not fetch an upstream NarraFork product binary", () => {
	// The whole point of the task: binaries come from compiling this source.
	for (const step of allSteps()) {
		const run = step.run ?? "";
		expect(run).not.toMatch(/releases\/download/);
		expect(run).not.toMatch(/curl|wget/);
	}
});
