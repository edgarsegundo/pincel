import { createStore } from 'zustand/vanilla';
import { defaults, sanitize, type Settings } from './schema';

const KEY = 'pincel.settings';

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved?.version === 1) return sanitize(saved.values);
  } catch { /* sem storage */ }
  return defaults();
}

export const settings = createStore<Settings>(() => load());

const persist = () => {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, values: settings.getState() })); } catch { /* ignora */ }
};

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings.setState({ [key]: value } as Partial<Settings>);
  persist();
}

export function resetSettings() {
  settings.setState(defaults(), true);
  persist();
}

export const effectiveTheme = (): 'light' | 'dark' => {
  const t = settings.getState().theme;
  if (t !== 'auto') return t;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
