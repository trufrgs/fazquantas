---
name: mobile-fodinha
description: Como gerar e publicar os apps Android e iOS do Faz Quantas? com Capacitor
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

   Sem isso, o app procura o servidor na porta 3001 do próprio aparelho, e o online não conecta.

2. Gere o build nativo e sincronize:

   ```bash
   pnpm --filter @fodinha/web cap:sync      # vite build --mode native && cap sync
   pnpm --filter @fodinha/web cap:android   # abre no Android Studio
   pnpm --filter @fodinha/web cap:ios       # abre no Xcode
   ```

3. Rode no emulador ou no aparelho pelo Android Studio ou pelo Xcode.

O modo contra bots funciona 100% offline no app. O online precisa do servidor publicado.

## Ícones e splash

Desenhados em `brand/marca.html` (o "?" com a chama do palito, sobre o vermelho de copas) e
fotografados em cada tamanho pelo gerador:

```bash
node scripts/make-brand.mjs   # desenha tudo a partir de brand/marca.html
```

Isso atualiza os ícones do PWA (`apps/web/public/icons`), os ícones e aberturas nativos de Android
(inclusive o adaptativo e o monocromático do Android 13) e de iOS, e as peças de divulgação em
`brand/pecas` (destaque da Play Store, prévia de link, logotipo).

## Antes de publicar nas lojas

- **appId:** `br.com.fazquantas` (em `apps/web/capacitor.config.ts`, no Android e no iOS). Depois do
  primeiro envio a uma loja ele não muda mais.
- **Nome:** nas lojas o app se chama **Faz Quantas?**. "Fodinha" (o nome tradicional do jogo, que tem
  palavrão) fica fora do título e do ícone; a descrição pode citar "o jogo que o pessoal chama de
  Fodinha".
- **Assinatura:** keystore no Android e certificados/perfil no iOS (feitos no Android Studio/Xcode).
- **Convites por link:** hoje o link `?sala=ABCD` abre o jogo no navegador. Para abrir direto no app,
  configure App Links (Android) e Universal Links (iOS) apontando para o domínio do servidor.
- **Orientação:** o app funciona em pé e deitado. Para travar em retrato, ajuste no Xcode e no
  `AndroidManifest.xml`.
