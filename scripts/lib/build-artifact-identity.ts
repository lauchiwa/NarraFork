/**
 * Local build-artifact identity verification shared by the GitHub Release
 * publisher and the self-build CI checker.
 *
 * Extracted unchanged from `scripts/lib/github-release.ts` so both callers
 * verify ONE metadata format with ONE set of byte budgets. Nothing here
 * contacts a network, a release host or a database; every function only reads
 * local files with bounded streaming and compares them against the sidecar
 * metadata produced by `scripts/lib/binary-metadata.ts`.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { MAX_RELEASE_BINARY_BYTES } from "../../shared/release-patch";
import type { BinaryMetadata } from "./binary-metadata";

export const MAX_BINARY_BYTES = MAX_RELEASE_BINARY_BYTES;
export const MAX_TEXT_BYTES = 1024 * 1024;
export const MAX_METADATA_BYTES = 64 * 1024;

export interface FileIdentity {
	size: number;
	sha256: string;
	sha512: string;
}

/**
 * Stream-hash a single regular file within a byte budget.
 *
 * Streaming (rather than `readFileSync`) is required: a release/self-build job
 * verifies several hundred-megabyte binaries and must not hold them in the JS
 * heap at once. Symlinks, directories and empty files are rejected, and a file
 * whose size changes while being read fails closed.
 */
export async function fileIdentity(path: string, maximum: number): Promise<FileIdentity> {
	const stat = await lstat(path);
	if (!stat.isFile() || stat.size === 0 || stat.size > maximum) {
		throw new Error(`Invalid asset size/type: ${path}`);
	}
	const sha256 = createHash("sha256");
	const sha512 = createHash("sha512");
	let size = 0;
	for await (const chunk of createReadStream(path)) {
		size += chunk.length;
		if (size > maximum) throw new Error(`Asset exceeds size limit: ${path}`);
		sha256.update(chunk);
		sha512.update(chunk);
	}
	if (size !== stat.size) throw new Error(`Asset changed while reading: ${path}`);
	return { size, sha256: sha256.digest("hex"), sha512: sha512.digest("base64") };
}

/** Bounded text read with the same type/size/stability guarantees as {@link fileIdentity}. */
export async function readTextAsset(path: string, maximum = MAX_TEXT_BYTES): Promise<string> {
	const stat = await lstat(path);
	if (!stat.isFile() || stat.size === 0 || stat.size > maximum) {
		throw new Error(`Invalid text asset size/type: ${path}`);
	}
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of createReadStream(path)) {
		size += chunk.length;
		if (size > maximum) throw new Error(`Text asset exceeds size limit: ${path}`);
		chunks.push(chunk);
	}
	if (size !== stat.size) throw new Error(`Text asset changed while reading: ${path}`);
	return Buffer.concat(chunks, size).toString("utf8");
}

export interface ExpectedBinaryIdentity {
	/** Binary filename, e.g. "narrafork-0.8.3-linux-x64". */
	name: string;
	version: string;
	/** Update-server platform id, e.g. "linux-x64", "win-x64-baseline". */
	platform: string;
	/** Bun compile target, e.g. "bun-linux-x64". */
	target: string;
	/** Fully resolved 40-character source commit the artifact must descend from. */
	commit: string;
}

/**
 * Validate a parsed sidecar `*.metadata.json` against the identity the caller
 * expects. The short build commit must be a prefix of the resolved source
 * commit, so a binary compiled from a different checkout cannot be published or
 * uploaded as this build.
 */
export function assertBinaryMetadata(
	metadata: BinaryMetadata,
	expected: ExpectedBinaryIdentity,
	label: string,
): void {
	if (!/^[a-f0-9]{40}$/.test(expected.commit)) throw new Error("Expected full source commit SHA");
	if (
		metadata.name !== expected.name ||
		metadata.version !== expected.version ||
		metadata.platform !== expected.platform ||
		metadata.target !== expected.target ||
		!metadata.commit ||
		!/^[a-f0-9]{7,40}$/.test(metadata.commit) ||
		!expected.commit.startsWith(metadata.commit) ||
		!metadata.buildDate ||
		!Number.isFinite(Date.parse(metadata.buildDate)) ||
		!Number.isSafeInteger(metadata.size) ||
		metadata.size <= 0 ||
		!/^[a-f0-9]{64}$/.test(metadata.sha256) ||
		!/^[A-Za-z0-9+/]{86}==$/.test(metadata.sha512)
	)
		throw new Error(`Invalid binary metadata/provenance: ${label}`);
}

/** The bytes on disk must be exactly what the sidecar claims. */
export function assertIdentityMatchesMetadata(
	identity: FileIdentity,
	metadata: BinaryMetadata,
	label: string,
): void {
	if (
		identity.size !== metadata.size ||
		identity.sha256 !== metadata.sha256 ||
		identity.sha512 !== metadata.sha512
	) {
		throw new Error(`Binary size/hash mismatch: ${label}`);
	}
}
