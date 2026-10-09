import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildFamily } from "../build-targets";
import { archiveCommand, archiveName, packageSelfBuild } from "../self-build-check";

const roots: string[] = [];
const temp = () => {
	const root = mkdtempSync(join(tmpdir(), "nf-selfbuild-pkg-"));
	roots.push(root);
	return root;
};
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 2 });
});

/** The family the current host can actually archive and extract. */
const hostFamily: BuildFamily = process.platform === "win32" ? "windows" : "linux";

test("archive names follow the per-system download layout", () => {
	expect(archiveName("1.2.3", "linux")).toBe("narrafork-1.2.3-linux.tar.gz");
	expect(archiveName("1.2.3", "darwin")).toBe("narrafork-1.2.3-macos.tar.gz");
	expect(archiveName("1.2.3", "windows")).toBe("narrafork-1.2.3-windows.zip");
});

test("archive commands pass an explicit member list, never a glob", () => {
	const command = archiveCommand("linux", "/dist", "out.tar.gz", ["a", "b"]);
	expect(command.slice(1)).toEqual([
		"-c",
		"-z",
		"-f",
		join("/dist", "out.tar.gz"),
		"-C",
		"/dist",
		"--",
		"a",
		"b",
	]);
	expect(command.some((part) => part.includes("*"))).toBe(false);
	// Windows needs bsdtar's -a; GNU tar cannot write zip archives at all.
	expect(archiveCommand("windows", "/dist", "out.zip", ["a"]).slice(1, 4)).toEqual([
		"-a",
		"-c",
		"-f",
	]);
});

test.each([
	["empty list", []],
	["option-like member", ["--checkpoint-action=exec=sh"]],
	["nested path", ["frontend/index.html"]],
	["windows nested path", ["frontend\\index.html"]],
])("archive commands refuse an %s", (_label, files) => {
	expect(() => archiveCommand("linux", "/dist", "out.tar.gz", files)).toThrow();
});

test("packaging writes a real archive containing exactly the allowlist", () => {
	const distDir = temp();
	const binary = "narrafork-9.9.9-host";
	writeFileSync(join(distDir, binary), "compiled");
	writeFileSync(join(distDir, `${binary}.metadata.json`), "{}");
	writeFileSync(join(distDir, "narrafork-9.9.9-SHA256SUMS"), "hash  name\n");
	// Artifacts that must never be packaged.
	mkdirSync(join(distDir, "frontend"));
	writeFileSync(join(distDir, "frontend/index.html"), "<html></html>");
	writeFileSync(join(distDir, "narrafork.db"), "sqlite");
	writeFileSync(join(distDir, "narrafork.log"), "log");
	if (process.platform !== "win32") chmodSync(join(distDir, binary), 0o755);

	const files = [binary, `${binary}.metadata.json`, "narrafork-9.9.9-SHA256SUMS"];
	const packaged = packageSelfBuild(hostFamily, distDir, "9.9.9", files);
	expect(packaged.archive).toBe(archiveName("9.9.9", hostFamily));
	expect(packaged.members).toEqual([...files].sort());
	expect(packaged.members).not.toContain("frontend/index.html");
	expect(packaged.members).not.toContain("narrafork.db");
	expect(packaged.members).not.toContain("narrafork.log");

	const extracted = temp();
	const tool =
		process.platform === "win32"
			? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
			: "tar";
	const extract = Bun.spawnSync(
		[tool, "-x", "-f", join(distDir, packaged.archive), "-C", extracted],
		{
			stdout: "pipe",
			stderr: "pipe",
			timeout: 60_000,
		},
	);
	expect(new TextDecoder().decode(extract.stderr)).toBe("");
	expect(extract.exitCode).toBe(0);
	// Unix archives must still carry the executable bit: GitHub artifacts do not.
	if (process.platform !== "win32")
		expect(statSync(join(extracted, binary)).mode & 0o111).toBe(0o111);
	expect(statSync(join(extracted, `${binary}.metadata.json`)).isFile()).toBe(true);
});

test("packaging fails when a listed member is absent", () => {
	const distDir = temp();
	writeFileSync(join(distDir, "present"), "payload");
	expect(() => packageSelfBuild(hostFamily, distDir, "9.9.9", ["present", "absent"])).toThrow();
});
