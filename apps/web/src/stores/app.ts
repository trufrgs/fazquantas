import { create } from 'zustand';

export type ScreenName = 'home' | 'setup' | 'online' | 'lobby' | 'game' | 'rules' | 'settings' | 'credits';

interface AppState {
  screen: ScreenName;
  stack: ScreenName[];
  go: (screen: ScreenName) => void;
  back: () => void;
  reset: (screen: ScreenName) => void;
  /**
   * Troca uma tela por outra onde ela estiver: se é a atual, vira a nova raiz; se está na pilha,
   * o "voltar" passa a levar para a nova (ex.: quem lê as regras quando a partida volta para a sala).
   */
  swap: (from: ScreenName, to: ScreenName) => void;
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
  swap: (from, to) => {
    const { screen, stack } = get();
    if (screen === from) set({ screen: to, stack: [] });
    else if (stack.includes(from)) set({ stack: stack.map((s) => (s === from ? to : s)) });
  },
}));
