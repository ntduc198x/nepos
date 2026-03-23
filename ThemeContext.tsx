
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { loadTranslations, type TranslationDict } from './i18n';

type Theme = 'light' | 'dark';
type Language = 'en' | 'vi';

export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  scheduleEnabled: boolean;
  dayStart: string;
  nightStart: string;
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
  brightness: number;
  setBrightness: (val: number) => void;
  t: (key: string) => string;
  setThemeConfig: (config: ThemeConfig) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system');
  const [effectiveTheme, setEffectiveTheme] = useState<Theme>('dark');
  const [language, setLanguage] = useState<Language>('vi');
  const [brightness, setBrightness] = useState(100);
  const [dictionary, setDictionary] = useState<TranslationDict>({});
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    mode: 'system',
    scheduleEnabled: false,
    dayStart: '06:00',
    nightStart: '18:00'
  });

  useEffect(() => {
    // Load from local storage if available
    const savedLang = localStorage.getItem('app_language') as Language;
    if (savedLang) setLanguage(savedLang);
  }, []);

  useEffect(() => {
    localStorage.setItem('app_language', language);
  }, [language]);

  useEffect(() => {
    let mounted = true;
    loadTranslations(language)
      .then((dict) => {
        if (mounted) setDictionary(dict);
      })
      .catch(() => {
        if (mounted) setDictionary({});
      });

    return () => {
      mounted = false;
    };
  }, [language]);

  const calculateTheme = useCallback(() => {
    if (themeConfig.mode === 'system') {
        if (themeConfig.scheduleEnabled) {
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            if (timeStr >= themeConfig.dayStart && timeStr < themeConfig.nightStart) {
                return 'light';
            } else {
                return 'dark';
            }
        } else {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
    }
    return themeConfig.mode;
  }, [themeConfig]);

  useEffect(() => {
    const t = calculateTheme();
    setEffectiveTheme(t);
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(t);
  }, [calculateTheme]);

  const setTheme = (t: Theme) => {
      // Manual override sets mode to specific
      setThemeConfig(prev => ({ ...prev, mode: t }));
  };

  const t = useCallback((key: string) => {
    return dictionary[key] || key;
  }, [dictionary]);

  return (
    <ThemeContext.Provider value={{
      theme: effectiveTheme,
      setTheme,
      language,
      setLanguage,
      brightness,
      setBrightness,
      t,
      setThemeConfig
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
