# AGENTS.md — Faz quantas?

> Instruções para agentes de IA (fonte única). O Claude Code chega aqui pelo `CLAUDE.md`
> (`@AGENTS.md`); os outros agentes leem este arquivo direto. Para pessoas, o ponto de partida é o
> [README](README.md) e o [CONTRIBUTING](CONTRIBUTING.md).

## O que é

Jogo de Fodinha (baralho espanhol, regra gaúcha) para jogar contra bots ou com amigos online:
<https://fazquantas.pages.dev>. Projeto **pessoal** do Thomas (`@trufrgs`), sem relação com a
Aegro: conta pessoal do GitHub (`trufrgs/fazquantas`, privado) e do Cloudflare
(`conta pessoal`), e só serviços gratuitos.

## Mapa

| Pasta | O quê |
|---|---|
| `packages/engine` | Regras puras, visões por jogador, bots, `GameHost`, protocolo, série, ranking, perfil |
| `packages/sala` | A sala online sem transporte: lobby, senha, série, ranking, reconexão, assíncrona, validação |
| `apps/worker` | Servidor no Cloudflare Workers: `SalaDO` (uma por sala), `RankingDO`, `AvisosDO` (push), `ContasDO` (apelido com PIN, bloqueio), `PainelDO` (admin) |
| `apps/web` | React + Vite + Tailwind + Motion (PWA); Capacitor em `android/` e `ios/` |
| `e2e` | Playwright pela interface (local e contra a produção com `E2E_BASE`) |
| `brand` | Fonte da marca e dos avatares (`gauderio.js`, `avatares.js`); `scripts/make-*.mjs` geram as peças |
| `docs` | Regras, deploy, lançamento, apps |

## Comandos

```bash
pnpm install
pnpm dev          # web (5173) + wrangler dev (8787)
pnpm lint && pnpm typecheck && pnpm test   # o mesmo que a CI roda
pnpm exec playwright test                  # E2E locais (sobem os servidores sozinhos)
```

- Os scripts de teste já limitam os workers do Vitest (`--maxWorkers=3`); ao rodar o Vitest à mão,
  passe `--maxWorkers=3` também.
- Mudou o `apps/worker/wrangler.jsonc`? Rode `pnpm --filter @fodinha/worker types` (gera o
  `worker-configuration.d.ts`). Classe nova de Durable Object precisa de migração nova (`v4`, `v5`…).

## Convenções

- **Texto para o jogador em pt-BR, com fala gaúcha** ("tu", "Buenas", "mão", "empardou", "tri",
  "deu pra ti"). Cada disputa de cartas é uma **mão** (nunca "vaza"); dizer quantas faz é
  **cantar** ("Faço 2!", "As cantadas"). Mensagens de erro dizem o que houve e o que fazer, sem pedir
  desculpa.
- Código, identificadores e comentários seguem o que já existe: identificadores de domínio em
  português (`sala`, `palpite`, `apelido`), comentários em português.
- Commits em inglês, Conventional Commits com escopo quando ajuda (`feat(web):`, `fix(worker):`).
- A `main` publica sozinha (CI → Cloudflare). Mudança grande ou arriscada vai por PR.
- Horas que aparecem para pessoas: horário de Brasília (`America/Sao_Paulo`).

## Segredos

- **Nunca** em arquivo do repositório, em argumento de comando (`argv`) ou em log.
- Fonte da verdade: **segredos do GitHub** (`CLOUDFLARE_API_TOKEN`, `VAPID_PRIVADO`, `ADMIN_SENHA`);
  a CI publica o Worker já com `VAPID_PRIVADO` e `ADMIN_SENHA` (`wrangler deploy --secrets-file`,
  uma publicação só: cada publicação reinicia as salas abertas).
- Cópias locais no Keychain do macOS: `pessoal/fazquantas/<nome>` (conta `trufrgs`). Para mandar um
  valor do Keychain a outro lugar, use pipe (`security find-generic-password … -w | gh secret set …`).
- Variável não secreta: `CLOUDFLARE_ACCOUNT_ID` (variável do repositório no GitHub).

## Deploy e operação

- Detalhes em [docs/DEPLOY.md](docs/DEPLOY.md): arquitetura, limites do plano gratuito, admin.
- Configure pelo **API/CLI** (`gh`, `wrangler`, API do Cloudflare com o token), não pelo painel. O
  painel só quando não existe API (ex.: criar o primeiro token).
- Dados de produção: `RANKING_NOME`, `CONTAS_NOME` e `PAINEL_NOME` nomeiam os objetos de ranking,
  apelidos e painel. Trocar o nome começa do zero (o antigo fica guardado, sem uso).

## Testes

- Toda mudança de regra, sala ou servidor vem com teste de unidade (`packages/*/test`,
  `apps/worker/test`).
- **Sala que acorda:** o Durable Object da sala some da memória e volta do que salvou (hibernação,
  deploy, alarme). Timer novo na sala precisa ser recalculado no `Sala.restore` a partir do estado
  salvo, **antes** de religar a partida: a contagem de sala parada já recomeçou a cada despertar e
  mesa abandonada não acabava nunca (28/09/2026; teste em `novidades.test.ts`, "hibernação").
- **Admin em massa:** `e2e/admin-massa.spec.ts` liga a manutenção (barra sala nova para todos), por
  isso roda num projeto próprio do Playwright, depois dos outros; sozinho:
  `pnpm exec playwright test --project admin --no-deps`.
- **Atualização do app:** o service worker novo assume na hora e o app confere o `version.json`
  (`lib/atualizacao.ts`). Mexeu em service worker, `vite.config.ts`, `public/_headers` ou nesse
  arquivo? Rode `pnpm exec playwright test e2e/atualizacao.spec.ts`: o bug de aba presa na versão
  antiga já aconteceu uma vez (28/09/2026).
- **Fase atual (antes da v1 validada com gente de verdade): testes exploratórios.** Os E2E existem
  e rodam à mão (local e contra a produção), mas a CI não os roda. Depois da v1, as verificações
  viram E2E na CI e os testes com pessoas ganham runbooks.
- Testar contra a produção deixa rastro (partidas no ranking, apelidos, acessos): troque os nomes
  dos objetos (acima) antes de lançar.
