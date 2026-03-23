export type TranslationDict = Record<string, string>;

export const loadTranslations = async (language: 'en' | 'vi'): Promise<TranslationDict> => {
  switch (language) {
    case 'en': {
      const mod = await import('./locales/en');
      return mod.default;
    }
    case 'vi':
    default: {
      const mod = await import('./locales/vi');
      return mod.default;
    }
  }
};
