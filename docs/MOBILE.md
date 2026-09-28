---
name: mobile-fodinha
description: Como gerar e publicar os apps Android e iOS do Fodinha com Capacitor
owner: "@trufrgs"
last_updated: 2026-09-28
status: active
---

# Apps Android e iOS

O app é o próprio build web empacotado pelo Capacitor 8. Os projetos nativos já estão em
`apps/web/android` e `apps/web/ios` (iOS com Swift Package Manager, sem CocoaPods).

## Pré-requisitos

- Android: Android Studio (traz o JDK e o SDK).
- iOS: macOS com Xcode 16 ou mais novo.

## Gerar e abrir

1. Publique o servidor (ver [DEPLOY.md](DEPLOY.md)) e aponte o app para ele. Dentro do app a origem é
   `capacitor://localhost`/`https://localhost`, então o endereço do servidor precisa ir no build:

   ```bash
   cd apps/web
   echo "VITE_SERVER_URL=https://seu-servidor.exemplo.com" > .env.native.local
   ```

   Sem isso, o app tenta `http://localhost:3001`, que só funciona no emulador com o servidor local.

2. Gere o build nativo e sincronize:

   ```bash
   pnpm --filter @fodinha/web cap:sync      # vite build --mode native && cap sync
   pnpm --filter @fodinha/web cap:android   # abre no Android Studio
   pnpm --filter @fodinha/web cap:ios       # abre no Xcode
   ```

3. Rode no emulador ou no aparelho pelo Android Studio ou pelo Xcode.

O modo contra bots funciona 100% offline no app. O online precisa do servidor publicado.

## Ícones e splash

Gerados a partir das cartas (espadão na frente do bastião, sobre madeira):

```bash
python scripts/make-icons.py --native   # requer Pillow
```

Isso atualiza os ícones do PWA (`apps/web/public/icons`), a entrada do `@capacitor/assets`
(`apps/web/assets`) e os arquivos nativos de Android e iOS.

## Antes de publicar nas lojas

- **appId:** hoje é `br.com.fodinha.app` (em `apps/web/capacitor.config.ts`). Troque pelo definitivo
  antes do primeiro envio; depois de publicado ele não muda.
- **Nome:** "Fodinha" é o nome do jogo, mas tem palavrão. A Apple e o Google podem pedir classificação
  etária mais alta ou recusar o nome de exibição. Tenha um nome alternativo pronto (por exemplo, com
  subtítulo "carteado com baralho espanhol").
- **Assinatura:** keystore no Android e certificados/perfil no iOS (feitos no Android Studio/Xcode).
- **Convites por link:** hoje o link `?sala=ABCD` abre o jogo no navegador. Para abrir direto no app,
  configure App Links (Android) e Universal Links (iOS) apontando para o domínio do servidor.
- **Orientação:** o app funciona em pé e deitado. Para travar em retrato, ajuste no Xcode e no
  `AndroidManifest.xml`.
