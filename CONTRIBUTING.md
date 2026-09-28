# Contribuindo

Como mexer no Faz quantas? sem quebrar a mesa de ninguém. Agentes de IA: veja também o
[AGENTS.md](AGENTS.md).

## Preparar

Node 24 (`.nvmrc`) e pnpm 9 (`corepack enable`).

```bash
pnpm install
pnpm dev
```

`pnpm dev` sobe o web em <http://localhost:5173> e o servidor (Worker no `wrangler dev`) em
<http://localhost:8787>. O web acha o servidor sozinho, inclusive do celular na mesma rede
(`http://<IP-do-computador>:5173`).

## Antes de mandar

```bash
pnpm lint
pnpm typecheck
pnpm test
```

É o que a CI roda em todo push e PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
Mexeu na interface ou no jogo online? Rode também os E2E:

```bash
pnpm exec playwright test
```

## Testes

- **Unidade** (Vitest): regras e bots em `packages/engine/test`, sala online em
  `packages/sala/test`, servidor em `apps/worker/test`, interface em `apps/web/src/**/*.test.ts`.
  Regra, sala ou servidor novo vem com teste.
- **E2E** (Playwright, celular Pixel 7): `e2e/`. Sobem o web e o Worker locais com pausas curtas
  (`RAPIDO=1`). Contra a produção:

  ```bash
  E2E_BASE=https://fazquantas.pages.dev pnpm exec playwright test e2e/amigos.spec.ts e2e/online-game.spec.ts
  ```

  Com `E2E_ADMIN_SENHA` no ambiente, `e2e/perfil-admin.spec.ts` também roda contra a produção.
- **Fase atual: exploratória.** Até a v1 ser validada com gente de verdade, os E2E rodam à mão e a
  CI não os roda. Depois da v1: as verificações viram E2E na CI e os testes com pessoas ganham
  runbooks.
- Testar na produção deixa partidas no ranking, apelidos e acessos no admin. Antes de lançar, troque
  `RANKING_NOME` (`apps/worker/src/ranking-do.ts`), `CONTAS_NOME` (`contas-do.ts`) e `PAINEL_NOME`
  (`painel-do.ts`).

## Commits e branches

- Conventional Commits em inglês: `feat(web): …`, `fix(worker): …`, `chore: …`.
- A `main` publica sozinha. Mudança grande ou arriscada: branch + PR (a CI verifica o PR).

## Publicação

A CI publica a `main` no Cloudflare (Worker, segredos, site, checagem de saúde). Arquitetura,
limites do plano gratuito e operação em [docs/DEPLOY.md](docs/DEPLOY.md).

| No GitHub (`trufrgs/fazquantas`) | Tipo | Para quê |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | segredo | A CI publica no Cloudflare. Token com Workers Scripts: Edit, Cloudflare Pages: Edit, Account Settings: Read |
| `CLOUDFLARE_ACCOUNT_ID` | variável | Conta do Cloudflare |
| `VAPID_PRIVADO` | segredo | Assina o Web Push; a CI copia para o Worker |
| `ADMIN_SENHA` | segredo | Senha do `/admin` (8+ caracteres); a CI copia para o Worker |

Trocar um segredo: `gh secret set NOME -R trufrgs/fazquantas` (pede o valor sem mostrar) e rodar a
CI de novo (`gh workflow run CI -R trufrgs/fazquantas`). Nunca passe segredo como argumento de
comando nem grave em arquivo do repositório.
