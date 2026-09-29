---
name: deploy-fodinha
description: Como o Faz quantas? está publicado (Cloudflare Pages + Workers), o que cabe no plano gratuito e como operar
owner: "@trufrgs"
last_updated: 2026-09-28
status: active
---

# Deploy

Tudo roda no plano gratuito do Cloudflare, na conta pessoal. A CI do GitHub
([ci.yml](../.github/workflows/ci.yml)) publica cada push na `main` do
[trufrgs/fazquantas](https://github.com/trufrgs/fazquantas) depois de lint, tipos e testes: primeiro o
Worker, depois os segredos, depois o site, e confere a saúde no fim. Segredos e variáveis do GitHub
estão no [CONTRIBUTING](../CONTRIBUTING.md#publicação).

| Parte | Onde | Endereço |
|---|---|---|
| Site (PWA) | Cloudflare Pages, projeto `fazquantas` | <https://fazquantas.pages.dev> |
| Servidor do jogo online | Cloudflare Workers, `fazquantas-api` | <https://fazquantas-api.fancy-night-938c.workers.dev> |

## Como funciona

- **Site:** a CI gera `apps/web/dist` (`pnpm --filter @fodinha/web build:pages`) e manda com
  `wrangler pages deploy` para o projeto `fazquantas`. O web fala com o Worker de produção por padrão
  (`apps/web/src/lib/platform.ts`); `VITE_SERVER_URL` troca o endereço.
- **Servidor:** um Worker na frente (`apps/worker/src/index.ts`) e Durable Objects com SQLite:
  - `SalaDO`: uma sala por objeto (`idFromName(código)`). WebSockets hibernáveis, estado salvo a cada
    mudança, e o alarme do objeto como relógio (bots, tempo da vez, pausas). A sala some sozinha
    depois de 15 min sem ninguém conectado; a assíncrona (1 h ou mais por jogada), depois de 7 dias
    sem lance e sem ninguém conectado.
  - `RankingDO`: um objeto só com as partidas valendo ranking (tabelas `jogadores`, `partidas`,
    `resultados`). O nome do objeto está em `RANKING_NOME` (`apps/worker/src/ranking-do.ts`): trocar
    o nome começa um ranking zerado.
  - `AvisosDO`: assinaturas de Web Push por perfil (até 5 aparelhos por perfil).
  - `ContasDO`: apelidos guardados com PIN (PBKDF2 com sal; 5 erros livres e depois espera que dobra
    até 24 h) e bloqueios de perfil. A sala confere cada pessoa que senta: perfil guardado senta com
    o apelido e o avatar dele, apelido de outro ganha número, bloqueado não senta.
  - `PainelDO`: o painel do `/admin` — visitas por dia (IP truncado, cidade, aparelho), salas abertas
    e encerradas (com a última atividade de gente), contadores (salas, partidas, ranqueadas, avisos,
    salas barradas), histórico do que o admin e a automação fizeram, regras da automação,
    manutenção e o limite de salas por endereço (guardado só como resumo do IP, por 24 h). Guarda
    90 dias (o histórico, 180).
- **Rotas da sala:** `GET /api/salas/<código>` (WebSocket da mesa), `GET /api/salas/<código>/info`
  (situação, para "Tuas salas") e `POST /api/salas/<código>/sair` (sair pelo token, sem WebSocket: o app
  manda junto com o `room:leave`, com `keepalive`).
- **Crons do Worker** (`triggers.crons` no `wrangler.jsonc`, horário UTC):
  - `*/15 * * * *` — automação (`apps/worker/src/automacao.ts`): confere as salas paradas há mais de
    20 min; fecha no painel as que sumiram; encerra lobby parado (12 h), partida terminada parada
    (2 h) e, como rede de segurança, mesa ao vivo sem ninguém há mais de 1 h e assíncrona parada há
    mais de 8 dias. Os prazos ajustáveis ficam no admin (aba Automação).
  - `0 0 * * *` — resumo do dia por push para os aparelhos do admin (21:00 BRT).
  - Para rodar o cron local: `curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"`.
- O Worker publica com `wrangler deploy` na CI. Os builds pelo Git do próprio Cloudflare ficam
  desligados (desde 28/09/2026, pela API: Pages com `deployments_enabled: false` e os gatilhos do
  Workers Builds apagados), para não publicar duas vezes nem fora de ordem.
- **Cache:** `sw.js`, `index.html`, `manifest.webmanifest` e `version.json` nunca ficam em cache
  (`public/_headers`); `/assets/*` tem hash no nome e fica em cache para sempre. Cada build publica
  `version.json` com o commit, e o app compara com o dele (ver `apps/web/src/lib/atualizacao.ts`).

## Variáveis e segredos do Worker

| Nome | Tipo | Para quê |
|---|---|---|
| `ORIGENS` | variável | Sites que podem abrir salas (além de localhost, rede local, prévias `*.fazquantas.pages.dev` e o app nativo) |
| `SITE` | variável | Link das notificações |
| `VAPID_PUBLICO` / `VAPID_CONTATO` | variável | Web Push |
| `VAPID_PRIVADO` | **segredo**, vem do segredo do GitHub (a CI copia) | Assina o push. Cópia no Keychain: `pessoal/fazquantas/vapid-privado` |
| `ADMIN_SENHA` | **segredo**, vem do segredo do GitHub (a CI copia; 8+ caracteres) | Entrada do `/admin`. Sem ele, o admin fica desligado; trocar a senha derruba as sessões do admin |
| `RAPIDO` | variável | `1` só nos testes E2E, com pausas curtas |

Trocar o par VAPID: gerar um par P-256 novo, pôr a privada no segredo `VAPID_PRIVADO` do GitHub e a
pública em `VAPID_PUBLICO`.
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
- **Admin:** <https://fazquantas.pages.dev/admin> (senha = `ADMIN_SENHA`, também no Bitwarden). Se
  atualiza sozinho a cada 30 s. Abas:
  - **Agora:** o que pede atenção (manutenção ligada, automação atrasada, mesas paradas, salas
    barradas pelo limite), quem está na mesa e o recado para todas as mesas.
  - **Salas:** filtros (paradas, sem ninguém, ao vivo, no seu tempo), seleção de várias ("paradas há
    mais de N h" seleciona de uma vez) para encerrar com motivo ou mandar recado; encerradas da
    semana com o motivo.
  - **Jogadores:** renomear e liberar apelido, tirar do ranking, bloquear (7 dias ou de vez).
  - **Números:** uso do dia, da semana e dos 30 dias, países e os acessos um a um.
  - **Automação:** prazos das regras, "Rodar agora", a última rodada, **manutenção** (barra sala
    nova, com mensagem, e pode avisar as mesas abertas; quem está jogando segue) e o resumo do dia
    neste aparelho.
  - **Histórico:** tudo que o admin e a automação fizeram, com os perfis pelo nome.
  - Antes de um deploy arriscado: ligar a manutenção com o recado, publicar, conferir, desligar.
- **Saúde:** `curl https://fazquantas-api.fancy-night-938c.workers.dev/api/saude`.
- **Testes contra a produção:** `E2E_BASE=https://fazquantas.pages.dev pnpm exec playwright test
  e2e/amigos.spec.ts e2e/online-game.spec.ts` (três navegadores isolados, senha, série e ranking).
  Com `E2E_ADMIN_SENHA` definido, `e2e/perfil-admin.spec.ts` e `e2e/assincrono.spec.ts` também rodam
  contra a produção. Esses testes deixam partidas no ranking, apelidos e acessos: depois, troque
  `RANKING_NOME`, `CONTAS_NOME` e `PAINEL_NOME` para os dados de verdade começarem limpos.
- **Desenvolvimento:** `pnpm dev` sobe o web (5173) e o `wrangler dev` (8787), com os mesmos Durable
  Objects em SQLite local (`apps/worker/.wrangler/`).
