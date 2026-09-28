/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** URL do servidor multiplayer (o Worker, ex.: https://fazquantas-api.conta.workers.dev). */
  readonly VITE_SERVER_URL?: string;
  /** `off` esconde o jogo online (web publicado sem servidor multiplayer). */
  readonly VITE_MULTIPLAYER?: string;
  /** Endereço do site, para o convite mandado de dentro do app nativo. */
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
/** Identidade do build (commit curto, ou a hora do build): o `version.json` publicado diz o mesmo. */
declare const __BUILD_ID__: string;
