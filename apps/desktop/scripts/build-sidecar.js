/**
 * Build Bun sidecar binary for the current host target.
 *
 * Tauri externalBin expects a target-suffixed filename:
 *   binaries/server-<target-triple>[.exe]
 *
 * We also emit a generic `binaries/server` binary for local tooling parity.
 */

const { spawnSync } = require("node:child_process");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");

const serverDir = resolve(__dirname, "../../server-ts");
const binariesDir = resolve(__dirname, "../src-tauri/binaries");

const targetMap = {
  "darwin-arm64": {
    bunTarget: "bun-darwin-arm64",
    outputName: "server-aarch64-apple-darwin",
  },
  "darwin-x64": {
    bunTarget: "bun-darwin-x64",
    outputName: "server-x86_64-apple-darwin",
  },
  "linux-arm64": {
    bunTarget: "bun-linux-arm64",
    outputName: "server-aarch64-unknown-linux-gnu",
  },
  "linux-x64": {
    bunTarget: "bun-linux-x64",
    outputName: "server-x86_64-unknown-linux-gnu",
  },
  "win32-x64": {
    bunTarget: "bun-windows-x64",
    outputName: "server-x86_64-pc-windows-msvc.exe",
  },
};

function runBunBuild(args) {
  const result = spawnSync("bun", args, {
    cwd: serverDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const hostKey = `${process.platform}-${process.arch}`;
const hostTarget = targetMap[hostKey];

if (!hostTarget) {
  console.error(`[sidecar] Unsupported platform/arch: ${hostKey}`);
  process.exit(1);
}

mkdirSync(binariesDir, { recursive: true });

const hostOutfile = resolve(binariesDir, hostTarget.outputName);
console.log(`[sidecar] Building host sidecar: ${hostTarget.outputName}`);
runBunBuild([
  "build",
  "--compile",
  `--target=${hostTarget.bunTarget}`,
  "src/index.ts",
  `--outfile=${hostOutfile}`,
]);

const genericOutfile = resolve(binariesDir, "server");
console.log("[sidecar] Building generic local sidecar: server");
runBunBuild([
  "build",
  "--compile",
  "--target=bun",
  "src/index.ts",
  `--outfile=${genericOutfile}`,
]);

