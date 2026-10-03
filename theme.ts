export type AppTheme = 'light' | 'dark';

const THEME_KEY = 'beesmart_theme';

export const getStoredTheme = (): AppTheme => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (e) {}
  return 'light';
};

export const applyTheme = (theme: AppTheme) => {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {}
};

export const toggleTheme = (): AppTheme => {
  const next: AppTheme = getStoredTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
};

export const initTheme = () => {
  applyTheme(getStoredTheme());
};