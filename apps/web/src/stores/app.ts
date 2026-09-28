import { create } from 'zustand';

export type ScreenName = 'home' | 'setup' | 'online' | 'lobby' | 'game' | 'rules' | 'settings' | 'credits';

interface AppState {
  screen: ScreenName;
  stack: ScreenName[];
  go: (screen: ScreenName) => void;
  back: () => void;
  reset: (screen: ScreenName) => void;
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'home',
  stack: [],
  go: (screen) => set({ screen, stack: [...get().stack, get().screen] }),
  back: () => {
    const stack = get().stack.slice();
    const prev = stack.pop() ?? 'home';
    set({ screen: prev, stack });
  },
  reset: (screen) => set({ screen, stack: [] }),
}));
