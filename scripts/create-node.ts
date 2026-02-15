#!/usr/bin/env bun
/**
 * AITuberFlow プラグイン作成CLI
 *
 * 新しいプラグインの雛形を対話的に作成します。
 *
 * 使用方法:
 *   bun run scripts/create-node.ts
 *   bun run scripts/create-node.ts --name my-node --category utility
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { parseArgs } from "util";
import * as readline from "readline";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const PLUGINS_DIR = join(PROJECT_ROOT, "plugins");
const CATEGORIES_FILE = join(PLUGINS_DIR, "categories.json");

const CATEGORY_COLORS: Record<string, { color: string; bgColor: string }> = {
  control: { color: "#10B981", bgColor: "rgba(16, 185, 129, 0.15)" },
  input: { color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.1)" },
  llm: { color: "#10B981", bgColor: "rgba(16, 185, 129, 0.1)" },
  tts: { color: "#F59E0B", bgColor: "rgba(245, 158, 11, 0.1)" },
  avatar: { color: "#E879F9", bgColor: "rgba(232, 121, 249, 0.1)" },
  output: { color: "#A855F7", bgColor: "rgba(168, 85, 247, 0.1)" },
  utility: { color: "#6366F1", bgColor: "rgba(99, 102, 241, 0.1)" },
  obs: { color: "#302E31", bgColor: "rgba(48, 46, 49, 0.3)" },
};

const CATEGORY_ICONS: Record<string, string> = {
  control: "Play",
  input: "MessageSquare",
  llm: "Cpu",
  tts: "Volume2",
  avatar: "User",
  output: "Monitor",
  utility: "FileJson",
  obs: "Monitor",
};

interface Category {
  id: string;
  label: string;
  labelEn?: string;
  order?: number;
  description?: string;
}

interface Port {
  id: string;
  type: string;
  description?: string;
}

interface PluginConfig {
  name: string;
  displayName: string;
  category: string;
  inputs: Port[];
  outputs: Port[];
  color: string;
  bgColor: string;
  icon: string;
}

// --- Utilities ---

function loadCategories(): Category[] {
  if (existsSync(CATEGORIES_FILE)) {
    const data = JSON.parse(readFileSync(CATEGORIES_FILE, "utf-8"));
    return data.categories ?? [];
  }
  return [
    { id: "control", label: "制御フロー" },
    { id: "input", label: "入力" },
    { id: "llm", label: "LLM" },
    { id: "tts", label: "音声合成" },
    { id: "avatar", label: "アバター" },
    { id: "output", label: "出力" },
    { id: "utility", label: "ユーティリティ" },
    { id: "obs", label: "OBS" },
  ];
}

function validatePluginName(name: string): { valid: boolean; error: string } {
  if (!name) {
    return { valid: false, error: "プラグイン名を入力してください" };
  }
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return {
      valid: false,
      error: "プラグイン名は小文字英字で始まり、小文字英数字とハイフンのみ使用できます",
    };
  }
  if (existsSync(join(PLUGINS_DIR, name))) {
    return { valid: false, error: `プラグイン '${name}' は既に存在します` };
  }
  return { valid: true, error: "" };
}

function toClassName(pluginName: string): string {
  return pluginName
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// --- Readline helper ---

function createPrompt(): {
  ask: (question: string) => Promise<string>;
  close: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return {
    ask: (question: string) =>
      new Promise<string>((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      }),
    close: () => rl.close(),
  };
}

// --- File generators ---

function createManifest(config: PluginConfig): object {
  return {
    $schema: "https://aituber-flow.dev/schemas/plugin-manifest.json",
    id: config.name,
    name: config.displayName,
    version: "1.0.0",
    description: `${config.displayName}プラグイン`,
    author: {
      name: "AITuberFlow",
      url: "https://github.com/oboroge0/AITuberFlow",
    },
    license: "MIT",
    category: config.category,
    ui: {
      label: config.displayName,
      icon: config.icon,
      color: config.color,
      bgColor: config.bgColor,
      statusText: "待機中...",
    },
    node: {
      inputs: config.inputs,
      outputs: config.outputs,
      events: {
        emits: [],
        listens: [],
      },
    },
    config: {},
  };
}

function createNodeTs(config: PluginConfig): string {
  const className = toClassName(config.name);

  const inputCode =
    config.inputs.length > 0
      ? config.inputs
          .map((inp) => `    const ${inp.id} = inputs.${inp.id} ?? "";`)
          .join("\n")
      : "    // 入力なし";

  const outputCode =
    config.outputs.length > 0
      ? config.outputs
          .map((out) => `      ${out.id}: undefined, // TODO: 出力値を設定`)
          .join("\n")
      : "";

  const returnStatement =
    config.outputs.length > 0
      ? `return {\n${outputCode}\n    };`
      : "return {};";

  return `/**
 * ${config.displayName} Node
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class ${className}Node extends BaseNode {
  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    await context.log("${config.displayName}を初期化しました");
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
${inputCode}

    // TODO: ここに処理を実装
    await context.log("処理を実行しました");

    ${returnStatement}
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
`;
}

function createReadme(config: PluginConfig): string {
  let inputsTable: string;
  if (config.inputs.length > 0) {
    inputsTable =
      "| ポート | 型 | 説明 |\n|--------|-----|------|\n" +
      config.inputs
        .map(
          (inp) => `| ${inp.id} | ${inp.type} | ${inp.description ?? ""} |`,
        )
        .join("\n");
  } else {
    inputsTable = "なし";
  }

  let outputsTable: string;
  if (config.outputs.length > 0) {
    outputsTable =
      "| ポート | 型 | 説明 |\n|--------|-----|------|\n" +
      config.outputs
        .map(
          (out) => `| ${out.id} | ${out.type} | ${out.description ?? ""} |`,
        )
        .join("\n");
  } else {
    outputsTable = "なし";
  }

  return `# ${config.displayName}

${config.displayName}プラグイン

## 入力

${inputsTable}

## 出力

${outputsTable}

## 設定

（設定項目があれば記載）

## 使用例

（使用例を記載）
`;
}

// --- Interactive mode ---

async function interactiveMode(): Promise<PluginConfig | null> {
  const prompt = createPrompt();

  console.log("\n🚀 AITuberFlow プラグイン作成ウィザード\n");
  console.log("=".repeat(50));

  // プラグイン名
  let name = "";
  while (true) {
    name = await prompt.ask("\n1. プラグイン名 (例: my-awesome-node): ");
    const { valid, error } = validatePluginName(name);
    if (valid) break;
    console.log(`   ❌ ${error}`);
  }

  // 表示名
  const defaultDisplay = name
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const displayNameInput = await prompt.ask(
    `\n2. 表示名 [${defaultDisplay}]: `,
  );
  const displayName = displayNameInput || defaultDisplay;

  // カテゴリ
  const categories = loadCategories();
  console.log("\n3. カテゴリを選択してください:");
  for (let i = 0; i < categories.length; i++) {
    console.log(
      `   [${i + 1}] ${categories[i].id.padEnd(12)} - ${categories[i].label}`,
    );
  }

  let category = "";
  while (true) {
    const choice = await prompt.ask("\n   選択 (番号): ");
    const idx = parseInt(choice, 10) - 1;
    if (idx >= 0 && idx < categories.length) {
      category = categories[idx].id;
      break;
    }
    console.log("   ❌ 有効な番号を入力してください");
  }

  // 入出力ポート
  const inputs = await promptPorts("入力", prompt.ask);
  const outputs = await promptPorts("出力", prompt.ask);

  prompt.close();

  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.utility;
  const icon = CATEGORY_ICONS[category] ?? "Box";

  return {
    name,
    displayName,
    category,
    inputs,
    outputs,
    color: colors.color,
    bgColor: colors.bgColor,
    icon,
  };
}

async function promptPorts(
  portType: string,
  ask: (q: string) => Promise<string>,
): Promise<Port[]> {
  const ports: Port[] = [];
  console.log(`\n${portType}ポートを追加します（空欄で終了）`);

  while (true) {
    const portId = await ask("  ポート名 (例: text): ");
    if (!portId) break;

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(portId)) {
      console.log(
        `   ❌ '${portId}' は有効な識別子ではありません（英字で始まり、英数字とアンダースコアのみ使用可能）`,
      );
      continue;
    }

    if (ports.some((p) => p.id === portId)) {
      console.log(`   ❌ '${portId}' は既に追加されています`);
      continue;
    }

    const portDataType =
      (await ask("  型 [string]: ")) || "string";
    const portDesc = await ask("  説明: ");

    const port: Port = { id: portId, type: portDataType };
    if (portDesc) port.description = portDesc;

    ports.push(port);
    console.log(`  ✓ ${portId} を追加しました\n`);
  }

  return ports;
}

// --- Create plugin files ---

function createPlugin(config: PluginConfig): string {
  const pluginDir = join(PLUGINS_DIR, config.name);
  mkdirSync(pluginDir, { recursive: true });

  // manifest.json
  const manifest = createManifest(config);
  writeFileSync(
    join(pluginDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );

  // node.ts
  const nodeTs = createNodeTs(config);
  writeFileSync(join(pluginDir, "node.ts"), nodeTs, "utf-8");

  // README.md
  const readme = createReadme(config);
  writeFileSync(join(pluginDir, "README.md"), readme, "utf-8");

  return pluginDir;
}

// --- Main ---

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      name: { type: "string" },
      category: { type: "string" },
      "display-name": { type: "string" },
    },
  });

  let config: PluginConfig;

  if (values.name) {
    // CLI mode
    const { valid, error } = validatePluginName(values.name);
    if (!valid) {
      console.error(`❌ ${error}`);
      process.exit(1);
    }

    const allowedCategories = new Set(Object.keys(CATEGORY_COLORS));
    if (values.category && !allowedCategories.has(values.category)) {
      console.error(`❌ 無効なカテゴリ: '${values.category}'`);
      console.error(
        `   有効なカテゴリ: ${[...allowedCategories].sort().join(", ")}`,
      );
      process.exit(1);
    }

    const category = values.category ?? "utility";
    const displayName =
      values["display-name"] ??
      values.name
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

    const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.utility;

    config = {
      name: values.name,
      displayName,
      category,
      inputs: [{ id: "input", type: "string", description: "入力" }],
      outputs: [{ id: "output", type: "string", description: "出力" }],
      color: colors.color,
      bgColor: colors.bgColor,
      icon: CATEGORY_ICONS[category] ?? "Box",
    };
  } else {
    // Interactive mode
    const result = await interactiveMode();
    if (!result) {
      console.log("\n❌ キャンセルされました");
      process.exit(1);
    }
    config = result;
  }

  const pluginDir = createPlugin(config);
  const relativePath = pluginDir.replace(PROJECT_ROOT + "/", "").replace(PROJECT_ROOT + "\\", "");

  console.log("\n" + "=".repeat(50));
  console.log(`✅ プラグインを作成しました: ${relativePath}/`);
  console.log("\n📁 作成されたファイル:");
  console.log("   - manifest.json  (プラグイン設定)");
  console.log("   - node.ts        (実装)");
  console.log("   - README.md      (ドキュメント)");
  console.log("\n📝 次のステップ:");
  console.log(`   1. ${relativePath}/node.ts を編集して処理を実装`);
  console.log("   2. manifest.json で設定項目を追加");
  console.log("   3. エディタを開いて動作確認");
  console.log("=".repeat(50) + "\n");
}

main();
