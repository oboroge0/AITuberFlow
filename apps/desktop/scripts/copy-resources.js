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
const { execFileSync, execSync } = require("node:child_process");
const os = require("node:os");

const ROOT = resolve(__dirname, "../../..");

/** Resolve the bun binary path (handles PATH issues on Windows). */
function findBun() {
  try {
    const cmd = process.platform === "win32" ? "where bun" : "which bun";
    return execSync(cmd, { encoding: "utf-8" }).trim().split(/\r?\n/)[0];
  } catch {
    // Fallback to common install locations
    const home = os.homedir();
    const candidates = [
      join(home, ".bun", "bin", "bun"),
      join(home, ".bun", "bin", "bun.exe"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return "bun"; // hope for the best
  }
}

const BUN = findBun();
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
  execFileSync(BUN, ["build", sdkEntry, "--format=esm", "--outfile", sdkOutFile], {
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

/**
 * Scan plugin source files for external npm imports and install them
 * into resources/node_modules/ so that dynamically-imported plugins
 * can resolve their dependencies at runtime.
 */
function installPluginDependencies() {
  const { readFileSync, readdirSync } = require("node:fs");
  const pluginsDir = join(ROOT, "plugins");
  const serverPkg = JSON.parse(
    readFileSync(join(ROOT, "apps", "server-ts", "package.json"), "utf-8"),
  );
  const serverDeps = serverPkg.dependencies || {};

  // Collect external imports from all plugin node.ts files
  const needed = new Set();
  if (!existsSync(pluginsDir)) return;

  for (const name of readdirSync(pluginsDir)) {
    const nodeFile = join(pluginsDir, name, "node.ts");
    if (!existsSync(nodeFile)) continue;
    const src = readFileSync(nodeFile, "utf-8");
    // Match: from "pkg" or from "@scope/pkg"
    const re = /from\s+["']([^./][^"']*)["']/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const pkg = m[1];
      // Skip built-ins and SDK
      if (pkg === "@aituber-flow/sdk") continue;
      if (["fs", "path", "crypto", "os", "url", "stream", "events", "util", "child_process", "http", "https", "net", "buffer", "node:fs", "node:path", "node:crypto"].includes(pkg)) continue;
      // Use version from server-ts/package.json if available
      if (serverDeps[pkg]) {
        needed.add(pkg);
      }
    }
  }

  if (needed.size === 0) {
    console.log("[deps] No external plugin dependencies to install");
    return;
  }

  // Create a minimal package.json in resources/ and run bun install
  const depsObj = {};
  for (const pkg of needed) {
    depsObj[pkg] = serverDeps[pkg];
  }
  const resPkg = {
    name: "aituber-flow-plugin-deps",
    version: "0.0.0",
    private: true,
    dependencies: depsObj,
  };

  writeFileSync(join(DEST, "package.json"), `${JSON.stringify(resPkg, null, 2)}\n`);
  console.log(`[deps] Installing plugin dependencies: ${[...needed].join(", ")}`);

  execFileSync(BUN, ["install"], {
    cwd: DEST,
    stdio: "inherit",
  });
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

// Install external npm dependencies required by plugins.
// These packages are dynamically imported at runtime and cannot be
// bundled into the compiled sidecar binary.
installPluginDependencies();

console.log("Resource copy complete.");
