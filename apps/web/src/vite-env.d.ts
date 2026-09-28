/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** URL do servidor multiplayer (ex.: https://fodinha.fly.dev). */
  readonly VITE_SERVER_URL?: string;
  /** `off` esconde o jogo online (web publicado sem servidor multiplayer). */
  readonly VITE_MULTIPLAYER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
