import type { ConfigField, NodeField, ShowWhenCondition } from './types';

/**
 * Normalize manifest options to NodeField format.
 * Handles both string[] shorthand and { label, value }[] format.
 */
export function normalizeOptions(
  options?: ConfigField['options']
): { label: string; value: string | number }[] | undefined {
  if (!options) return undefined;
  return options.map((opt) => {
    if (typeof opt === 'string') {
      return { label: opt, value: opt };
    }
    const v = opt.value;
    const normalizedValue: string | number =
      typeof v === 'string' || typeof v === 'number' ? v : String(v ?? '');
    return { label: opt.label, value: normalizedValue };
  });
}

/**
 * Map manifest ConfigField.type to NodeField.type.
 */
function mapFieldType(manifestType: ConfigField['type']): NodeField['type'] {
  switch (manifestType) {
    case 'string':
      return 'text';
    case 'boolean':
      return 'checkbox';
    case 'number':
    case 'textarea':
    case 'select':
    case 'password':
    case 'prompt-builder':
    case 'input-list':
    case 'expression-list':
    case 'animation-file':
    case 'model-file':
    case 'png-expression-map':
    case 'memory-table':
      return manifestType;
    default:
      return 'text';
  }
}

/**
 * Convert manifest config (Record<string, ConfigField>) to NodeField[].
 */
export function manifestConfigToNodeFields(
  config: Record<string, ConfigField>
): NodeField[] {
  return Object.entries(config).map(([key, field]) => ({
    key,
    type: mapFieldType(field.type),
    label: field.label,
    placeholder: field.placeholder ?? field.description,
    options: normalizeOptions(field.options),
    min: field.min,
    max: field.max,
    required: field.required,
    defaultValue: field.default,
    dynamic: field.dynamic,
    dependsOn: field.dependsOn,
    accept: field.accept,
    showWhen: field.showWhen,
  }));
}

/**
 * Evaluate a showWhen condition against the current config.
 * Supports both legacy { key, value } and operator-based { field, operator, value } formats.
 */
export function evaluateShowWhen(
  condition: ShowWhenCondition | undefined,
  config: Record<string, unknown>
): boolean {
  if (!condition) return true;

  let fieldKey: string;
  let expectedValues: string[];
  let operator = 'in'; // default: check if value is in the list

  if ('key' in condition) {
    fieldKey = condition.key;
    expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
  } else {
    fieldKey = condition.field;
    expectedValues = Array.isArray(condition.value) ? condition.value : [condition.value];
    operator = condition.operator ?? 'in';
  }

  const currentValue = String(config[fieldKey] ?? '');

  switch (operator) {
    case 'eq':
    case '===':
      return expectedValues[0] === currentValue;
    case 'neq':
    case '!==':
      return expectedValues[0] !== currentValue;
    case 'not-in':
      return !expectedValues.includes(currentValue);
    case 'in':
      return expectedValues.includes(currentValue);
    default:
      console.warn(`[evaluateShowWhen] Unsupported operator: "${operator}", falling back to "in"`);
      return expectedValues.includes(currentValue);
  }
}
