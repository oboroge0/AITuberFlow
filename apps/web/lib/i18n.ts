// i18n implementation with separate locale files
import en from '@/locales/en.json';
import ja from '@/locales/ja.json';

export type Locale = 'en' | 'ja';

// Type for nested translation object
type NestedTranslations = {
  [key: string]: string | NestedTranslations;
};

// Flatten nested object to dot-notation keys
function flattenTranslations(
  obj: NestedTranslations,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in obj) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[newKey] = value;
    } else {
      Object.assign(result, flattenTranslations(value, newKey));
    }
  }

  return result;
}

// Flattened translations for each locale
export const translations = {
  en: flattenTranslations(en as NestedTranslations),
  ja: flattenTranslations(ja as NestedTranslations),
} as const;

// Extract all possible translation keys from the English translations
export type TranslationKey = keyof typeof translations.en;

// Get translation for a given locale and key
export function getTranslation(locale: Locale, key: string): string {
  const localeTranslations = translations[locale];
  const fallbackTranslations = translations.en;

  return (
    (localeTranslations as Record<string, string>)[key] ||
    (fallbackTranslations as Record<string, string>)[key] ||
    key
  );
}

// Get node description by node type
export function getNodeDescription(locale: Locale, nodeType: string): string {
  const key = `nodeDescription.${nodeType}`;
  const description = getTranslation(locale, key);
  // If key was returned (not found), use default
  return description === key
    ? getTranslation(locale, 'nodeDescription.default')
    : description;
}
