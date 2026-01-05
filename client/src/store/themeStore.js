import { create } from 'zustand';

export const useThemeStore = create((set) => ({
  isDark: typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-color-scheme: dark)').matches 
    : false,
  soundEnabled: true,
  
  toggleTheme: () => set((state) => ({ isDark: !state.isDark })),
  setDark: (isDark) => set({ isDark }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),
}));
