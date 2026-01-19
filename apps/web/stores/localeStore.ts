import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Locale, translations, TranslationKey } from '@/lib/i18n';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: 'ja', // Default to Japanese
      setLocale: (locale) => set({ locale }),
      t: (key) => {
        const locale = get().locale;
        return translations[locale][key] || translations.en[key] || key;
      },
    }),
    {
      name: 'aituber-flow-locale',
    }
  )
);

// Hook for easy access to translation function
export function useTranslation() {
  const { t, locale, setLocale } = useLocaleStore();
  return { t, locale, setLocale };
}
