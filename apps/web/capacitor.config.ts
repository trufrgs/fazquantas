import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App nativo (Android/iOS) empacotando o build web. Antes de publicar nas lojas, troque o
 * `appId` pelo definitivo (ele não pode mudar depois de publicado).
 * Para o multiplayer no app, gere o build com VITE_SERVER_URL apontando para o servidor público.
 */
const config: CapacitorConfig = {
  appId: 'br.com.fodinha.app',
  appName: 'Fodinha',
  webDir: 'dist',
  backgroundColor: '#1d120b',
  android: { backgroundColor: '#1d120b' },
  ios: { backgroundColor: '#1d120b', contentInset: 'never' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,
      backgroundColor: '#1d120b',
      showSpinner: false,
    },
    StatusBar: { overlaysWebView: true, style: 'DARK' },
  },
};

export default config;
