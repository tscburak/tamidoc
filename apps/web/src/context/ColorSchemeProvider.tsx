import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ColorSchemeContext, type ColorScheme } from './color-scheme';

const STORAGE_KEY = 'tamidoc-color-scheme';

function getInitialScheme(): ColorScheme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Manages light/dark mode by toggling the `.dark` class on <html>. */
export function ColorSchemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(getInitialScheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', colorScheme === 'dark');
    root.style.colorScheme = colorScheme;
    window.localStorage.setItem(STORAGE_KEY, colorScheme);
  }, [colorScheme]);

  const toggleColorScheme = useCallback(
    () => setColorScheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [],
  );

  return (
    <ColorSchemeContext.Provider value={{ colorScheme, toggleColorScheme, setColorScheme }}>
      {children}
    </ColorSchemeContext.Provider>
  );
}
