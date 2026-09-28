---
name: deploy-fodinha
description: Como o Faz quantas? está publicado (Cloudflare Pages + Workers), o que cabe no plano gratuito e como operar
owner: "@trufrgs"
last_updated: 2026-09-28
status: active
---

# Deploy

Tudo roda no plano gratuito do Cloudflare, na conta pessoal, e publica sozinho a cada push na `main`
do [trufrgs/fazquantas](https://github.com/trufrgs/fazquantas).

| Parte | Onde | Endereço |
|---|---|---|
| Site (PWA) | Cloudflare Pages, projeto `fazquantas` | <https://fazquantas.pages.dev> |
| Servidor do jogo online | Cloudflare Workers, `fazquantas-api` | <https://fazquantas-api.fancy-night-938c.workers.dev> |

## Como funciona

- **Site:** o Pages roda `pnpm --filter @fodinha/web build:pages` e publica `apps/web/dist`
  (variáveis de build `PNPM_VERSION=9.15.0` e `NODE_VERSION=24`). O web fala com o Worker de produção
  por padrão (`apps/web/src/lib/platform.ts`); `VITE_SERVER_URL` troca o endereço.
- **Servidor:** um Worker na frente (`apps/worker/src/index.ts`) e Durable Objects com SQLite:
  - `SalaDO`: uma sala por objeto (`idFromName(código)`). WebSockets hibernáveis, estado salvo a cada
    mudança, e o alarme do objeto como relógio (bots, tempo da vez, pausas). A sala some sozinha
    depois de 15 min sem ninguém conectado.
  - `RankingDO`: um objeto só com as partidas valendo ranking (tabelas `jogadores`, `partidas`,
    `resultados`). O nome do objeto está em `RANKING_NOME` (`apps/worker/src/ranking-do.ts`): trocar
    o nome começa um ranking zerado.
  - `AvisosDO`: assinaturas de Web Push por perfil (até 5 aparelhos por perfil).
- O Worker publica pelo Workers Builds (Git): deploy com
  `pnpm --filter @fodinha/worker exec wrangler deploy`; branches que não são a `main` sobem uma versão
  de prévia (`wrangler versions upload`).

## Variáveis e segredos do Worker

| Nome | Tipo | Para quê |
|---|---|---|
| `ORIGENS` | variável | Sites que podem abrir salas (além de localhost, rede local, prévias `*.fazquantas.pages.dev` e o app nativo) |
| `SITE` | variável | Link das notificações |
| `VAPID_PUBLICO` / `VAPID_CONTATO` | variável | Web Push |
| `VAPID_PRIVADO` | **segredo** (painel do Worker → Settings → Variables and secrets) | Assina o push. Cópia no Keychain: `pessoal/fazquantas/vapid-privado` |
| `RAPIDO` | variável | `1` só nos testes E2E, com pausas curtas |

Trocar o par VAPID: gerar um par P-256 novo, pôr a privada no segredo e a pública em `VAPID_PUBLICO`.
Os aparelhos refazem a assinatura sozinhos ao abrir o jogo (o web compara a chave).

## O que cabe no plano gratuito

| Limite (por dia) | Quanto a mesa gasta |
|---|---|
| 100 mil requisições | Cada mensagem de WebSocket conta como requisição ao Durable Object; o ping de 20 s é respondido sem acordar a sala |
| 13 mil GB-s de Durable Objects | A sala hiberna quando ninguém joga; partida de 4 pessoas fica bem abaixo de 1 GB-s |
| 100 mil linhas escritas | Uma gravação por mudança de estado da sala e poucas por partida ranqueada |
| 10 ms de CPU por invocação | O bot difícil tem teto de trabalho (`MC_WORK_BUDGET`) e fica em ~4 ms no p99; cada lance de bot roda num alarme próprio |

Folga para centenas de partidas por dia. Se passar do limite, as requisições do dia falham até a
virada (00:00 UTC, 21:00 BRT); nada é cobrado.

## Operar

- **Logs:** painel do Worker → Observability (a sala loga `sala encerrada`, erros de ranking, push e
  alarme).
- **Saúde:** `curl https://fazquantas-api.fancy-night-938c.workers.dev/api/saude`.
- **Testes contra a produção:** `E2E_BASE=https://fazquantas.pages.dev pnpm exec playwright test
  e2e/amigos.spec.ts e2e/online-game.spec.ts` (três navegadores isolados, senha, série e ranking).
  Esses testes jogam partidas valendo ranking: depois, troque `RANKING_NOME` para o ranking de verdade
  não mostrar os jogadores de teste.
- **Desenvolvimento:** `pnpm dev` sobe o web (5173) e o `wrangler dev` (8787), com os mesmos Durable
  Objects em SQLite local (`apps/worker/.wrangler/`).
