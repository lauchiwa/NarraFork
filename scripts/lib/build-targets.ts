/**
 * The eight NarraFork compile targets, grouped by the runner OS family that
 * builds them.
 *
 * This table is the single source of truth for `scripts/build-cross-platform.ts`
 * and for the self-build CI checker. A per-family job must enumerate the exact
 * targets it owns: "a glob matched one binary" is not evidence that a family
 * built completely, and a checker with its own private copy of this list would
 * silently drift away from what the build actually produces.
 *
 * `platformId` must keep matching `getPlatform()` in the update service
 * (e.g. "darwin-arm64", "win-x64", "linux-x64-baseline").
 */

/** Runner OS family that compiles and packages a group of targets. */
export type BuildFamily = "linux" | "windows" | "darwin";

export const BUILD_FAMILIES: readonly BuildFamily[] = ["linux", "windows", "darwin"];

export interface BuildTarget {
	/** Bun compile target, e.g. "bun-linux-x64". */
	target: string;
	/** Update-server platform id, e.g. "linux-x64". */
	platformId: string;
	/** Filename suffix after `narrafork-<version>-`, e.g. "linux-x64", "windows-x64.exe". */
	suffix: string;
	family: BuildFamily;
}

export const BUILD_TARGETS: readonly BuildTarget[] = [
	{
		target: "bun-darwin-arm64",
		platformId: "darwin-arm64",
		suffix: "macos-arm64",
		family: "darwin",
	},
	{ target: "bun-darwin-x64", platformId: "darwin-x64", suffix: "macos-x64", family: "darwin" },
	{ target: "bun-linux-x64", platformId: "linux-x64", suffix: "linux-x64", family: "linux" },
	{
		target: "bun-linux-x64-baseline",
		platformId: "linux-x64-baseline",
		suffix: "linux-x64-baseline",
		family: "linux",
	},
	{ target: "bun-linux-arm64", platformId: "linux-arm64", suffix: "linux-arm64", family: "linux" },
	{
		target: "bun-windows-x64",
		platformId: "win-x64",
		suffix: "windows-x64.exe",
		family: "windows",
	},
	{
		target: "bun-windows-x64-baseline",
		platformId: "win-x64-baseline",
		suffix: "windows-x64-baseline.exe",
		family: "windows",
	},
	{
		target: "bun-windows-arm64",
		platformId: "win-arm64",
		suffix: "windows-arm64.exe",
		family: "windows",
	},
];

/** Binary filename for a target, e.g. "narrafork-0.8.3-windows-x64.exe". */
export const binaryName = (version: string, target: BuildTarget): string =>
	`narrafork-${version}-${target.suffix}`;

export function isBuildFamily(value: string): value is BuildFamily {
	return (BUILD_FAMILIES as readonly string[]).includes(value);
}

/** Fixed allowlist: a family job may neither skip nor add a target. */
export function targetsForFamily(family: BuildFamily): readonly BuildTarget[] {
	const targets = BUILD_TARGETS.filter((candidate) => candidate.family === family);
	if (!targets.length) throw new Error(`Unknown build family: ${family}`);
	return targets;
}

/**
 * `@parcel/watcher` binding keys (see `scripts/download-parcel-watcher.ts`) that
 * MUST be embedded for a set of targets.
 *
 * Linux needs both libc flavours because the compiled binary picks glibc or musl
 * at runtime, and the x64 baseline variant is a CPU-feature variant of the same
 * OS/arch binding. A missing binding degrades file watching at runtime, which
 * the ordinary (non-strict) download path only warns about.
 */
export function requiredWatcherKeys(targets: readonly BuildTarget[]): string[] {
	const keys = new Set<string>();
	for (const target of targets) {
		if (target.family === "darwin")
			keys.add(target.platformId === "darwin-arm64" ? "darwin-arm64" : "darwin-x64");
		else if (target.family === "windows")
			keys.add(target.platformId === "win-arm64" ? "win32-arm64" : "win32-x64");
		else
			for (const libc of ["glibc", "musl"])
				keys.add(`${target.platformId === "linux-arm64" ? "linux-arm64" : "linux-x64"}-${libc}`);
	}
	return [...keys].sort();
}
