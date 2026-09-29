# AGENTS.md — Faz quantas?

> Instruções para agentes de IA (fonte única). O Claude Code chega aqui pelo `CLAUDE.md`
> (`@AGENTS.md`); os outros agentes leem este arquivo direto. Para pessoas, o ponto de partida é o
> [README](README.md) e o [CONTRIBUTING](CONTRIBUTING.md).

## O que é

Jogo de Fodinha (baralho espanhol, regra gaúcha) para jogar contra bots ou com amigos online:
<https://fazquantas.pages.dev>. Projeto **pessoal** do Thomas (`@trufrgs`), sem relação com a
Aegro: conta pessoal do GitHub e do Cloudflare, e só serviços gratuitos.

**Código aberto** ([MIT](LICENSE)): o repositório `trufrgs/fazquantas` é público. Nada de segredo,
dado de jogador, print com dado de produção nem dado pessoal em arquivo, commit, issue ou PR.
Contribuição, fork e publicação da própria cópia: [CONTRIBUTING.md](CONTRIBUTING.md).

## O espírito do jogo (como decidir)

O jogo é uma mesa de bar do Rio Grande do Sul, não um aplicativo corporativo. Quando uma decisão de
produto, visual, som ou texto não está escrita, decida pelo que a turma acharia divertido numa
Fodinha de verdade, com gaita tocando e alguém tragando o palheiro. A referência é quem joga: o
feedback do Igor (29/09/2026) virou regra — "falta um tango no fundo", "barulhinho de puxando fumo
quando o cara demora", "o belo tem que brilhar, apagando as demais", "as animações podem ser mais
drásticas, tá muito educadinho".

- **Drástico, não educadinho.** Efeito e animação têm impacto: carta cortada voa em pedaços, pancada
  sacode a mesa, a manilha grita. Na dúvida entre discreto e teatral, vá de teatral (e deixe o
  "reduzir movimento" do aparelho apagar o exagero).
- **Cor local de verdade.** Baralho espanhol autêntico, fala gaúcha, tango e gaita, palheiro, mate;
  nada de ícone genérico ou clichê de cassino. O que aparece na mesa tem cara de galpão.
- **Som faz parte do jogo.** Efeito para o que acontece na mesa, música de fundo baixinha e humor
  (a tragada de quem espera), sempre com botão para desligar.
- **Humor com a mesa, nunca contra quem joga.** Provocação de bar (o grito da manilha, a tragada
  impaciente), sem humilhar ninguém nem atrapalhar a jogada.
- **Sem perguntar o óbvio.** Pedido nesse espírito é para fazer inteiro: implemente, teste com os
  cenários (`?cena=`), publique e conte o que ficou; volte só com decisão que é mesmo do dono.

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

## Conexão e volta à sala

Regras que já custaram bug com gente jogando (rodada de QA de 29/09/2026). Mexeu em
`apps/web/src/lib/sala-socket.ts`, `apps/web/src/stores/online.ts`, `packages/sala/src/servidor.ts`
ou no `Sala.restore`? Confira cada uma:

- **Lugar garantido:** sair da tela, perder a conexão ou demorar não tira ninguém da mesa. O lugar só
  fica livre quando a pessoa sai, o anfitrião tira ou a sala acaba (todos saíram, 12 h sem ninguém
  conectado, 7 dias na assíncrona, ou a automação do admin). Anfitrião fora há 3 min numa sala ao vivo
  (caiu ou escondeu o jogo) passa a coroa para quem está olhando a mesa, e ela volta quando quem criou
  a sala volta a olhar (voltar com o app em segundo plano, `visible: false` no `room:join`, não conta).
  Abrir o app com a sessão salva vai direto para a sala e, sem rede, segue tentando até voltar (ou a
  pessoa desistir).
  Relato de 29/09/2026: o lobby tirava o lugar em 3 min, e quem foi ao WhatsApp chamar a gurizada
  voltou sem lugar. Testes: `packages/sala/test/lugar-garantido.test.ts`.
- **Prova de vida no cliente:** conexão morta em silêncio não avisa. O socket pinga se ficou 10 s sem
  ouvir o servidor **ou sem mandar nada** (o servidor também precisa ouvir a gente), derruba em 5 s
  sem resposta, prova na hora (3 s) ao voltar a tela, a rede ou do cache de navegação (`pageshow`) e
  quando um pedido demora, e abandona tentativa que não abre em 8 s. Testes:
  `apps/web/src/lib/sala-socket.test.ts`.
- **Volta automática (`auto: true` no `room:join`):** a que o app faz sozinho (reconexão, abrir o app)
  nunca senta como gente nova (responde `SEAT_LOST` ou `KICKED`) e não toma o lugar de uma conexão
  viva de **outra** aba ou aparelho (`SEAT_TAKEN`). A mesma aba (identidade `aba` guardada no
  `sessionStorage`) sempre assume. Entrar tocando num botão ou pelo link não é automático e assume o
  lugar. Testes: `packages/sala/test/volta-automatica.test.ts`.
- **Sinal de vida no servidor:** `Conexao.vivaHa()` vem do horário do ping respondido pelo Cloudflare e
  da última mensagem (guardada no anexo do WebSocket, que sobrevive à hibernação). Conexão muda há mais
  de 30 s libera o lugar para o mesmo apelido entrar de outro aparelho.
- **Sair:** o app manda `room:leave` e também `POST /api/salas/<código>/sair` com o token (`keepalive`),
  porque com a conexão caída o `room:leave` some.
- **Sala que acorda:** timer recalculado no `Sala.restore` **antes** de religar a partida (ver "Testes").
- **Tela:** pedido feito durante o "Reconectando…" espera a volta ao assento; a atualização do app
  nunca recarrega por cima de uma tela de erro.
- Roteiros exploratórios que simulam modo avião, conexão morta, buraco negro, rede lenta, WebKit e
  Firefox: [`e2e/exploratorio/`](e2e/exploratorio/README.md).

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
  e rodam à mão (local e contra a produção), mas a CI não os roda; os roteiros de rede e aparelhos
  ficam em `e2e/exploratorio/`. Depois da v1, as verificações viram E2E na CI e os testes com pessoas
  ganham runbooks.
- Testar contra a produção deixa rastro (partidas no ranking, apelidos, acessos): troque os nomes
  dos objetos (acima) antes de lançar.
