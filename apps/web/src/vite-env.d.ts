/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do servidor multiplayer (ex.: https://fodinha.fly.dev). */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
