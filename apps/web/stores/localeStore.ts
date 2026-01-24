import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Locale,
  translations,
  getTranslation,
  getNodeDescription,
} from '@/lib/i18n';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  getNodeDesc: (nodeType: string) => string;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: 'ja', // Default to Japanese
      setLocale: (locale) => set({ locale }),
      t: (key) => {
        const locale = get().locale;
        return getTranslation(locale, key);
      },
      getNodeDesc: (nodeType) => {
        const locale = get().locale;
        return getNodeDescription(locale, nodeType);
      },
    }),
    {
      name: 'aituber-flow-locale',
    }
  )
);

// Hook for easy access to translation function
export function useTranslation() {
  const { t, locale, setLocale, getNodeDesc } = useLocaleStore();
  return { t, locale, setLocale, getNodeDesc };
}
