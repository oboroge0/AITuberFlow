/**
 * Data Formatter Node
 *
 * Formats data as JSON, XML, or YAML for structured output.
 * Supports template-based formatting with variable substitution.
 */

import { BaseNode, NodeContext } from "@aituber-flow/sdk";

export default class DataFormatterNode extends BaseNode {
  private format = "json";
  private template = "";
  private rootElement = "data";
  private prettyPrint = true;

  async setup(config: Record<string, any>, context: NodeContext): Promise<void> {
    this.format = config.format ?? "json";
    this.template = config.template ?? "";
    this.rootElement = config.rootElement ?? "data";
    this.prettyPrint = config.prettyPrint ?? true;

    await context.log(`Data Formatter configured: ${this.format.toUpperCase()} output`);
  }

  async execute(
    inputs: Record<string, any>,
    context: NodeContext,
  ): Promise<Record<string, any>> {
    let data: any = inputs.data ?? {};

    // Handle various input types
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = { value: data };
      }
    } else if (typeof data !== "object" || data === null) {
      data = { value: data };
    }

    try {
      let processedData: any;
      if (this.template) {
        processedData = this._applyTemplate(this.template, data);
      } else {
        processedData = data;
      }

      let formatted: string;
      if (this.format === "json") {
        formatted = this._toJson(processedData);
      } else if (this.format === "xml") {
        formatted = this._toXml(processedData);
      } else if (this.format === "yaml") {
        formatted = this._toYaml(processedData);
      } else {
        formatted = String(processedData);
      }

      await context.log(
        `Formatted data as ${this.format.toUpperCase()} (${formatted.length} chars)`,
      );

      return {
        formatted,
        parsed:
          typeof processedData === "object" && processedData !== null
            ? processedData
            : { value: processedData },
      };
    } catch (e) {
      await context.log(`Formatting error: ${String(e)}`, "error");
      return {
        formatted: `Error: ${String(e)}`,
        parsed: data,
      };
    }
  }

  private _applyTemplate(template: string, data: Record<string, any>): any {
    let result = template;

    // Find all {{...}} patterns using matchAll
    const allMatches = Array.from(template.matchAll(/\{\{([^}]+)\}\}/g));
    const matches = allMatches.map((m) => m[1]);

    for (const match of matches) {
      let field: string;
      let defaultVal: string;

      if (match.includes("|default:")) {
        const parts = match.split("|default:");
        field = parts[0].trim();
        defaultVal = parts[1].trim();
      } else {
        field = match.trim();
        defaultVal = "";
      }

      const value = this._getNestedValue(data, field, defaultVal);
      const placeholder = `{{${match}}}`;

      if (typeof value === "object" && value !== null) {
        result = result.split(placeholder).join(JSON.stringify(value));
      } else {
        result = result
          .split(placeholder)
          .join(value != null ? String(value) : defaultVal);
      }
    }

    result = result.trim();
    if (result.startsWith("{") || result.startsWith("[")) {
      try {
        return JSON.parse(result);
      } catch {
        // Not valid JSON
      }
    }

    return result;
  }

  private _getNestedValue(
    data: Record<string, any>,
    path: string,
    defaultVal: any = null,
  ): any {
    const keys = path.split(".");
    let value: any = data;

    for (const key of keys) {
      if (typeof value === "object" && value !== null && key in value) {
        value = value[key];
      } else {
        return defaultVal;
      }
    }

    return value;
  }

  private _toJson(data: any): string {
    if (this.prettyPrint) {
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(data);
  }

  private _toXml(data: any): string {
    const self = this;

    const dictToXml = (d: any, parentTag: string | null = null): string => {
      if (typeof d === "object" && d !== null && !Array.isArray(d)) {
        const items: string[] = [];
        for (const [key, val] of Object.entries(d)) {
          const tag = String(key).replace(/[^a-zA-Z0-9_-]/g, "_");
          items.push(`<${tag}>${dictToXml(val, tag)}</${tag}>`);
        }
        return self.prettyPrint ? items.join("\n") : items.join("");
      } else if (Array.isArray(d)) {
        const itemTag =
          parentTag && parentTag.endsWith("s")
            ? parentTag.slice(0, -1)
            : "item";
        const items = d.map(
          (item) => `<${itemTag}>${dictToXml(item, itemTag)}</${itemTag}>`,
        );
        return self.prettyPrint ? items.join("\n") : items.join("");
      } else {
        let text = d != null ? String(d) : "";
        text = text.replace(/&/g, "&amp;");
        text = text.replace(/</g, "&lt;");
        text = text.replace(/>/g, "&gt;");
        text = text.replace(/"/g, "&quot;");
        return text;
      }
    };

    const inner = dictToXml(data, this.rootElement);

    if (this.prettyPrint) {
      const indented = inner
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n");
      return `<?xml version="1.0" encoding="UTF-8"?>\n<${this.rootElement}>\n${indented}\n</${this.rootElement}>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?><${this.rootElement}>${inner}</${this.rootElement}>`;
  }

  private _toYaml(data: any): string {
    const self = this;

    const toYamlLines = (d: any, indent: number = 0): string[] => {
      const lines: string[] = [];
      const prefix = "  ".repeat(indent);

      if (typeof d === "object" && d !== null && !Array.isArray(d)) {
        for (const [key, val] of Object.entries(d)) {
          if (typeof val === "object" && val !== null) {
            lines.push(`${prefix}${key}:`);
            lines.push(...toYamlLines(val, indent + 1));
          } else {
            const yamlVal = self._yamlValue(val);
            lines.push(`${prefix}${key}: ${yamlVal}`);
          }
        }
      } else if (Array.isArray(d)) {
        for (const item of d) {
          if (typeof item === "object" && item !== null) {
            lines.push(`${prefix}-`);
            lines.push(...toYamlLines(item, indent + 1));
          } else {
            const yamlVal = self._yamlValue(item);
            lines.push(`${prefix}- ${yamlVal}`);
          }
        }
      } else {
        lines.push(`${prefix}${self._yamlValue(d)}`);
      }

      return lines;
    };

    return toYamlLines(data).join("\n");
  }

  private _yamlValue(value: any): string {
    if (value === null || value === undefined) {
      return "null";
    } else if (typeof value === "boolean") {
      return value ? "true" : "false";
    } else if (typeof value === "number") {
      return String(value);
    } else if (typeof value === "string") {
      const lower = value.toLowerCase();
      if (
        ["true", "false", "null", "yes", "no", "on", "off"].includes(lower) ||
        value.startsWith("{") ||
        value.startsWith("[") ||
        value.includes(":") ||
        value.includes("#") ||
        value.includes("\n")
      ) {
        const escaped = value
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n");
        return `"${escaped}"`;
      }
      return value;
    }
    return String(value);
  }

  async teardown(): Promise<void> {
    // No cleanup needed.
  }
}
