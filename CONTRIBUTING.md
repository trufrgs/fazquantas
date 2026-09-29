# Contribuindo

Buenas! O Faz quantas? tem código aberto ([licença MIT](LICENSE)), e toda ajuda é bem-vinda: relatar
um problema, sugerir uma regra da tua região, melhorar o jogo ou fazer a tua própria versão. Quem
participa segue o [código de conduta](CODE_OF_CONDUCT.md). Agentes de IA: veja também o
[AGENTS.md](AGENTS.md).

## Jeitos de ajudar

- **Deu problema?** Abra uma [issue de problema](https://github.com/trufrgs/fazquantas/issues/new?template=bug.yml)
  com o aparelho, o navegador e os passos. Print ajuda muito.
- **Tem uma ideia ou uma regra diferente?** Abra uma [issue de ideia](https://github.com/trufrgs/fazquantas/issues/new?template=ideia.yml).
- **Quer mexer no código?** Para mudança pequena (texto, bug óbvio), pode mandar o pull request
  direto. Para mudança grande (regra nova, tela nova, algo no jogo online), abra uma issue antes, para
  a gente combinar o caminho.
- **Achou uma falha de segurança?** Não abra issue pública: veja o [SECURITY.md](SECURITY.md).

## Preparar

Node 24 (`.nvmrc`) e pnpm 9 (`corepack enable`). Não precisa de conta em lugar nenhum para rodar local.

```bash
pnpm install
pnpm dev
```

`pnpm dev` sobe o web em <http://localhost:5173> e o servidor (Worker no `wrangler dev`, com os
Durable Objects em SQLite local) em <http://localhost:8787>. O web acha o servidor sozinho, inclusive
do celular na mesma rede (`http://<IP-do-computador>:5173`).

## Antes de mandar

```bash
pnpm lint
pnpm typecheck
pnpm test
```

É o que a CI roda em todo push e PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)), junto
com o [gitleaks](https://github.com/gitleaks/gitleaks) no histórico inteiro: o repositório é público,
e nenhum segredo, senha, token ou dado pessoal pode entrar, nem num commit antigo do PR (exceções em
`.gitleaks.toml`). Para conferir antes: `gitleaks git .`. Mexeu na interface ou no jogo online? Rode
também os de ponta a ponta:

```bash
pnpm exec playwright test
```

## Testes

- **Unidade** (Vitest): regras e bots em `packages/engine/test`, sala online em
  `packages/sala/test`, servidor em `apps/worker/test`, interface em `apps/web/src/**/*.test.ts`.
  Regra, sala ou servidor novo vem com teste.
- **Ponta a ponta** (Playwright, celular Pixel 7): `e2e/`. Sobem o web e o Worker locais com pausas
  curtas (`RAPIDO=1`). O teste do deploy no meio da partida (que reinicia o servidor local) roda
  primeiro e sozinho; para rodar um arquivo só, sem ele: `pnpm exec playwright test e2e/<arquivo> --no-deps`.
- **Exploratórios de rede e aparelhos** (`e2e/exploratorio/`): simulam modo avião, conexão morta em
  silêncio, rede lenta, celular dormindo, troca de aparelho, WebKit e Firefox. Rode quando mexer em
  conexão, sala ou reconexão. Como usar: [e2e/exploratorio/README.md](e2e/exploratorio/README.md).
- **Atualização do app** (`e2e/atualizacao.spec.ts`): prova que uma aba aberta passa sozinha para a
  versão nova, e que no meio da partida espera a pessoa sair da mesa. Rode sempre que mexer em service
  worker, `vite.config.ts`, `_headers` ou `lib/atualizacao.ts`.
- **Fase atual: exploratória.** Até a v1 ser validada com gente de verdade, os E2E rodam à mão e a CI
  não os roda.

## Convenções

- **Texto para quem joga:** pt-BR, com a fala da mesa gaúcha ("tu", "Buenas", "mão", "empardou",
  "cantar"). Mensagem de erro diz o que houve e o que fazer, sem pedir desculpa. Detalhes no
  [AGENTS.md](AGENTS.md).
- **Código:** identificadores de domínio e comentários em português, seguindo o que já existe.
- **Commits:** Conventional Commits em inglês (`feat(web): …`, `fix(worker): …`, `docs: …`).

## Pull requests

1. Faça um fork e crie uma branch a partir da `main`.
2. Rode lint, tipos e testes (e os E2E, se mexeu na interface ou no online).
3. Abra o PR para a `main` contando o que muda para quem joga e como testou (o modelo já pergunta).
4. A CI verifica o PR. Depois da revisão, o PR entra por squash e a `main` publica sozinha no
   <https://fazquantas.pages.dev>.

## Fazer o teu (fork publicado)

O jogo inteiro roda no plano gratuito do Cloudflare (Pages para o site, Workers com Durable Objects
para o jogo online). Para publicar a tua cópia:

1. **Fork** deste repositório no GitHub.
2. **Cloudflare:** crie uma conta grátis e um token de API
   ([painel → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens)) com
   *Workers Scripts: Edit*, *Cloudflare Pages: Edit* e *Account Settings: Read*. Crie o projeto do
   site (o nome vira o endereço `<nome>.pages.dev`):

   ```bash
   pnpm --filter @fodinha/worker exec wrangler pages project create <nome> --production-branch main
   ```

3. **O servidor, em `apps/worker/wrangler.jsonc`:** troque `name` (o Worker) e, em `vars`, `ORIGENS`,
   `SITE` e `VAPID_CONTATO` pelo endereço do teu site. Gere as chaves de notificação:

   ```bash
   node scripts/vapid.mjs --repo <teu-usuario>/<teu-fork>
   ```

   Ele grava a chave privada como segredo `VAPID_PRIVADO` no teu fork e mostra a pública, que vai em
   `VAPID_PUBLICO`. Depois rode `pnpm --filter @fodinha/worker types`.
4. **No GitHub do fork** (Settings → Secrets and variables → Actions):

   | Nome | Tipo | O quê |
   |---|---|---|
   | `CLOUDFLARE_API_TOKEN` | segredo | O token do passo 2 |
   | `ADMIN_SENHA` | segredo | Senha do teu `/admin` (8+ caracteres) |
   | `CLOUDFLARE_ACCOUNT_ID` | variável | O id da tua conta (aparece no painel do Cloudflare) |
   | `PAGES_PROJETO` | variável | O nome do projeto do passo 2 |
   | `SITE_URL` | variável | `https://<nome>.pages.dev` |
   | `API_URL` | variável | O endereço do teu Worker (`https://<worker>.<teu-subdominio>.workers.dev`) |

5. **Push na `main` do fork:** a CI publica o servidor e o site e confere a saúde dos dois.

Se for publicar para outras pessoas jogarem, use outro nome e outra marca: "Faz quantas?" e o Gaudério
identificam este jogo, e dois com o mesmo nome confundem quem joga.

Arquitetura, limites do plano gratuito, crons e operação: [docs/DEPLOY.md](docs/DEPLOY.md).

## Mantenedor

A CI publica a `main` deste repositório no Cloudflare (Worker com os segredos, site, checagem de
saúde).

| No GitHub (`trufrgs/fazquantas`) | Tipo | Para quê |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | segredo | A CI publica no Cloudflare. Token `fazquantas-github-actions`: Workers Scripts, Cloudflare Pages e Workers Builds Configuration (Edit), Account Settings (Read). Cópia no Keychain: `pessoal/fazquantas/cloudflare-api-token` |
| `CLOUDFLARE_ACCOUNT_ID` | variável | Conta do Cloudflare |
| `VAPID_PRIVADO` | segredo | Assina o Web Push; a CI copia para o Worker |
| `ADMIN_SENHA` | segredo | Senha do `/admin` (8+ caracteres); a CI copia para o Worker. Cópia no Keychain: `pessoal/fazquantas/admin-senha` |

Trocar um segredo: `gh secret set NOME -R trufrgs/fazquantas` (pede o valor sem mostrar) e rodar a CI
de novo (`gh workflow run CI -R trufrgs/fazquantas`). Nunca passe segredo como argumento de comando
nem grave em arquivo do repositório: ele é público.

Testar contra a produção deixa partidas no ranking, apelidos e acessos no admin:

```bash
E2E_BASE=https://fazquantas.pages.dev pnpm exec playwright test e2e/amigos.spec.ts e2e/online-game.spec.ts
```

Com `E2E_ADMIN_SENHA` no ambiente, `e2e/perfil-admin.spec.ts` também roda contra a produção. Antes de
um lançamento, troque `RANKING_NOME` (`apps/worker/src/ranking-do.ts`), `CONTAS_NOME` (`contas-do.ts`)
e `PAINEL_NOME` (`painel-do.ts`) para os dados de verdade começarem limpos.
