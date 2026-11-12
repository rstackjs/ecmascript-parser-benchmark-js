import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DEST = "files";
const REPO_URL = "https://github.com/yuku-toolchain/parser-benchmark-files";

function run(cmd: string[]): string | null {
  const result = spawnSync(cmd[0]!, cmd.slice(1), { encoding: "utf-8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.toString().trim();
}

function getRemoteHead(): string | null {
  const output = run(["git", "ls-remote", REPO_URL, "HEAD"]);
  return output?.split(/\s+/)[0] ?? null;
}

function getLocalHead(): string | null {
  if (!existsSync(`${DEST}/.git`)) return null;
  return run(["git", "-C", DEST, "rev-parse", "HEAD"]);
}

const localHead = getLocalHead();
const remoteHead = getRemoteHead();

if (remoteHead === null) {
  if (localHead !== null) {
    console.warn("\nCould not reach upstream, using existing files\n");
    process.exit(0);
  }
  console.error("\nCould not reach upstream and no files are present\n");
  process.exit(1);
}

if (localHead === remoteHead) {
  process.exit(0);
}

console.log(
  localHead === null
    ? "\nDownloading files..."
    : `\nUpstream changed (${localHead.slice(0, 7)} -> ${remoteHead.slice(0, 7)}), redownloading files...`,
);

rmSync(DEST, { recursive: true, force: true });

const clone = spawnSync("git", [
  "clone", "--quiet", "--no-progress", "--single-branch", "--depth", "1", REPO_URL, DEST,
], { stdio: "inherit" });

if (clone.error) throw clone.error;
if (clone.status !== 0) {
  console.error("\nFailed to download files\n");
  process.exit(1);
}

console.log("\nFiles downloaded\n");
