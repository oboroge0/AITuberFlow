/**
 * Copy resources into the Tauri bundle directory.
 *
 * Copies:
 *   plugins/     → src-tauri/resources/plugins/
 *   templates/   → src-tauri/resources/templates/
 *   apps/web/out → src-tauri/resources/web-dist/
 */

const { cpSync, mkdirSync, existsSync, rmSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = resolve(__dirname, "../../..");
const DEST = resolve(__dirname, "../src-tauri/resources");

function copyDir(src, dest) {
  if (!existsSync(src)) {
    console.warn(`[skip] ${src} does not exist`);
    return false;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[copy] ${src} -> ${dest}`);
  return true;
}

function bundleSdkRuntime() {
  const sdkEntry = join(ROOT, "packages", "sdk-ts", "src", "index.ts");
  const sdkDir = join(DEST, "node_modules", "@aituber-flow", "sdk");
  const sdkOutFile = join(sdkDir, "index.js");

  if (!existsSync(sdkEntry)) {
    console.warn(`[skip] ${sdkEntry} does not exist`);
    return false;
  }

  rmSync(sdkDir, { recursive: true, force: true });
  mkdirSync(sdkDir, { recursive: true });

  console.log(`[build] bundling SDK runtime: ${sdkEntry} -> ${sdkOutFile}`);
  execFileSync("bun", ["build", sdkEntry, "--format=esm", "--outfile", sdkOutFile], {
    cwd: ROOT,
    stdio: "inherit",
  });

  const sdkPackageJson = {
    name: "@aituber-flow/sdk",
    version: "0.1.0",
    type: "module",
    main: "./index.js",
    exports: {
      ".": "./index.js",
    },
  };
  writeFileSync(join(sdkDir, "package.json"), `${JSON.stringify(sdkPackageJson, null, 2)}\n`);
  console.log(`[write] ${join(sdkDir, "package.json")}`);

  return true;
}

const copies = [
  { src: join(ROOT, "plugins"), dest: join(DEST, "plugins") },
  { src: join(ROOT, "templates"), dest: join(DEST, "templates") },
  { src: join(ROOT, "apps", "web", "out"), dest: join(DEST, "web-dist") },
];

for (const { src, dest } of copies) {
  copyDir(src, dest);
}

// Provide a local runtime SDK module for plugin imports:
// import { ... } from "@aituber-flow/sdk"
bundleSdkRuntime();

console.log("Resource copy complete.");
