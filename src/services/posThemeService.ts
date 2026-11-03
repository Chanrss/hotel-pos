export type PosThemeId =
  | 'slate-amber'
  | 'navy-emerald'
  | 'royal-indigo'
  | 'heritage-green'
  | 'ocean-teal'
  | 'rosewood-burgundy'
  | 'obsidian-cobalt';

export interface PosThemeOption {
  id: PosThemeId;
  name: string;
  subtitle: string;
  shellBg: string;
  shellSecondary: string;
  accentPrimary: string;
  accentWarm: string;
  canvasBg: string;
  swatches: [string, string, string];
}

export const POS_THEMES: PosThemeOption[] = [
  {
    id: 'slate-amber',
    name: 'Classic Slate & Amber Gold (Original)',
    subtitle: 'Dark Slate (#0F172A), Warm Amber Gold (#F59E0B) & Crisp Slate canvas',
    shellBg: '#0F172A',
    shellSecondary: '#1E293B',
    accentPrimary: '#D97706',
    accentWarm: '#F59E0B',
    canvasBg: '#F8FAFC',
    swatches: ['#0F172A', '#F59E0B', '#F8FAFC']
  },
  {
    id: 'navy-emerald',
    name: 'Enterprise Navy & Emerald',
    subtitle: 'Classic Navy Slate (#0F172A), Crisp White canvas & Emerald Green accents',
    shellBg: '#0F172A',
    shellSecondary: '#1E293B',
    accentPrimary: '#059669',
    accentWarm: '#D97706',
    canvasBg: '#F8FAFC',
    swatches: ['#0F172A', '#10B981', '#F8FAFC']
  },
  {
    id: 'royal-indigo',
    name: 'Royal Indigo & Saffron',
    subtitle: 'Deep Indigo shell, Warm Pearl canvas & Saffron-Indigo accents',
    shellBg: '#1E1B4B',
    shellSecondary: '#312E81',
    accentPrimary: '#4F46E5',
    accentWarm: '#D97706',
    canvasBg: '#F6F6F9',
    swatches: ['#1E1B4B', '#4F46E5', '#D97706']
  },
  {
    id: 'heritage-green',
    name: 'Saravana Heritage & Gold',
    subtitle: 'Banana-Leaf Forest shell, Warm Ivory canvas & Temple Gold accents',
    shellBg: '#064E3B',
    shellSecondary: '#065F46',
    accentPrimary: '#059669',
    accentWarm: '#D97706',
    canvasBg: '#F7F8F5',
    swatches: ['#064E3B', '#059669', '#F59E0B']
  },
  {
    id: 'ocean-teal',
    name: 'Ocean Teal & Coral',
    subtitle: 'Deep Teal shell, Cool Alabaster canvas & Vibrant Teal accents',
    shellBg: '#134E4A',
    shellSecondary: '#115E59',
    accentPrimary: '#0D9488',
    accentWarm: '#EA580C',
    canvasBg: '#F3F7F7',
    swatches: ['#134E4A', '#0D9488', '#EA580C']
  },
  {
    id: 'rosewood-burgundy',
    name: 'Rosewood & Warm Cream',
    subtitle: 'Fine-Dining Burgundy shell, Cream canvas & Berry-Gold accents',
    shellBg: '#4C0519',
    shellSecondary: '#881337',
    accentPrimary: '#E11D48',
    accentWarm: '#D97706',
    canvasBg: '#FAF7F5',
    swatches: ['#4C0519', '#E11D48', '#D97706']
  },
  {
    id: 'obsidian-cobalt',
    name: 'Obsidian & Electric Cobalt',
    subtitle: 'Charcoal Obsidian shell, Crisp Snow canvas & Cobalt Blue accents',
    shellBg: '#18181B',
    shellSecondary: '#27272A',
    accentPrimary: '#2563EB',
    accentWarm: '#059669',
    canvasBg: '#F8FAFC',
    swatches: ['#18181B', '#2563EB', '#10B981']
  }
];

const STORAGE_KEY = 'pos_color_theme_v3';
const LEGACY_KEYS = ['pos_color_theme_id', 'pos_color_theme_v2'];

export function getSavedPosTheme(): PosThemeId {
  try {
    LEGACY_KEYS.forEach((k) => {
      if (localStorage.getItem(k)) {
        localStorage.removeItem(k);
      }
    });
    const saved = localStorage.getItem(STORAGE_KEY) as PosThemeId | null;
    if (saved && POS_THEMES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch (_) {}
  return 'slate-amber';
}

export function applyPosTheme(themeId: PosThemeId): PosThemeOption {
  const theme = POS_THEMES.find((t) => t.id === themeId) || POS_THEMES[0];
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-pos-theme', theme.id);
      document.documentElement.style.setProperty('--pos-shell-bg', theme.shellBg);
      document.documentElement.style.setProperty('--pos-shell-secondary', theme.shellSecondary);
      document.documentElement.style.setProperty('--pos-accent-primary', theme.accentPrimary);
      document.documentElement.style.setProperty('--pos-accent-warm', theme.accentWarm);
      document.documentElement.style.setProperty('--pos-canvas-bg', theme.canvasBg);
    }
    window.dispatchEvent(new CustomEvent('pos-theme-changed', { detail: theme }));
  } catch (_) {}
  return theme;
}

if (typeof window !== 'undefined') {
  applyPosTheme(getSavedPosTheme());
}



