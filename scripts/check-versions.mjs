// リリース時にバージョンを揃えるべきファイル群の整合性を検証する
//
// 使い方:
//   node scripts/check-versions.mjs              全ファイル間のバージョン一致を確認
//   node scripts/check-versions.mjs --tag v2.4.0 タグ名・CHANGELOG との一致も確認
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));

const versions = new Map();

versions.set("apps/web/package.json", readJson("apps/web/package.json").version);

const webLock = readJson("apps/web/package-lock.json");
versions.set("apps/web/package-lock.json (version)", webLock.version);
versions.set('apps/web/package-lock.json (packages."")', webLock.packages[""].version);

versions.set("apps/server-ts/package.json", readJson("apps/server-ts/package.json").version);
versions.set("apps/desktop/package.json", readJson("apps/desktop/package.json").version);
versions.set(
	"apps/desktop/src-tauri/tauri.conf.json",
	readJson("apps/desktop/src-tauri/tauri.conf.json").version,
);

const cargoToml = read("apps/desktop/src-tauri/Cargo.toml");
versions.set(
	"apps/desktop/src-tauri/Cargo.toml",
	cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
);

// Cargo.lock は cargo update -p <name> の実行漏れを検出するために確認する
const cargoName = cargoToml.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
const cargoLockPath = "apps/desktop/src-tauri/Cargo.lock";
if (cargoName && existsSync(cargoLockPath)) {
	const entry = read(cargoLockPath).match(
		new RegExp(`name = "${cargoName}"\\r?\\nversion = "([^"]+)"`),
	);
	versions.set(`apps/desktop/src-tauri/Cargo.lock (${cargoName})`, entry?.[1]);
}

let failed = false;
const unique = [...new Set(versions.values())];

if (unique.length !== 1 || unique[0] == null) {
	console.error("エラー: バージョンが一致していません");
	for (const [file, version] of versions) {
		console.error(`  ${String(version).padEnd(12)} ${file}`);
	}
	failed = true;
} else {
	console.log(`OK: 全ファイルのバージョンが一致 (${unique[0]})`);
}

const tagIndex = process.argv.indexOf("--tag");
if (tagIndex !== -1) {
	const tag = process.argv[tagIndex + 1];
	if (!tag) {
		console.error("エラー: --tag にはタグ名を指定してください（例: --tag v2.4.0）");
		process.exit(1);
	}
	// タグは v 付き、CHANGELOG の見出しは v なし
	const tagVersion = tag.replace(/^v/, "");

	if (unique.length === 1 && tagVersion !== unique[0]) {
		console.error(`エラー: タグ ${tag} とファイルのバージョン ${unique[0]} が一致していません`);
		failed = true;
	}

	if (read("CHANGELOG.md").includes(`## [${tagVersion}]`)) {
		console.log(`OK: CHANGELOG.md に ${tagVersion} のセクションがあります`);
	} else {
		console.error(`エラー: CHANGELOG.md に「## [${tagVersion}]」のセクションがありません`);
		failed = true;
	}
}

process.exit(failed ? 1 : 0);
