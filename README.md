# Faz quantas?

[![CI](https://github.com/trufrgs/fazquantas/actions/workflows/ci.yml/badge.svg)](https://github.com/trufrgs/fazquantas/actions/workflows/ci.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)
[![Jogar](https://img.shields.io/badge/jogar-fazquantas.pages.dev-e3a82b.svg)](https://fazquantas.pages.dev)

A Fodinha com baralho espanhol e regra gaúcha: diz quantas faz, faz quantas disse. Dá para jogar contra
bots no navegador ou com amigos online em <https://fazquantas.pages.dev>, e instalar como app no
computador, no Android e no iPhone, sem loja. Código aberto, sob [licença MIT](LICENSE).

<p>
  <img src="docs/img/inicio.webp" alt="Tela inicial" width="250" />
  <img src="docs/img/palpite.webp" alt="Hora do palpite" width="250" />
  <img src="docs/img/empardou.webp" alt="Cartas iguais empardando na mão" width="250" />
</p>

## Jogar agora

Requisitos: Node 22 ou mais novo e pnpm 9.

```bash
pnpm install
pnpm dev
```

- Abra <http://localhost:5173> e toque em **Jogar contra bots**: começa na hora, contra 3 bots
  ("Mudar bots e regras" ajusta quantos, a dificuldade e as regras).
- O `pnpm dev` também sobe o servidor do jogo online (o Worker, no `wrangler dev`) na porta 8787.
  Para jogar online na rede de casa,
  abra `http://<IP-do-computador>:5173` em outro navegador ou no celular (o Vite mostra o endereço
  "Network" no terminal), toque em **Jogar com a gurizada** e crie ou entre numa sala.

## O que tem

- **Regras** da Fodinha pesquisadas e configuráveis. A padrão é a gaúcha com manilhas fixas (espadão,
  bastião, 7 de espadas e 7 de ouros). Detalhes, variantes e fontes em [docs/REGRAS.md](docs/REGRAS.md).
- **Bots** em três níveis. O difícil simula a rodada centenas de vezes (Monte Carlo) e lê os palpites
  na rodada às cegas. Eles só enxergam o que um jogador enxergaria.
- **Online:** salas com código de 4 letras, link de convite e senha opcional. O anfitrião completa a
  mesa com bots, ajusta as regras, o ritmo (calma, normal ou ligeira) e o tempo por jogada. Quem
  estoura o tempo duas vezes fica ausente e a mesa joga por ele até ele voltar; quem cai ou recarrega
  a página volta ao mesmo lugar. Aviso da vez pelo título da aba e por notificação (push, mesmo com o
  jogo fechado).
- **Cada um no seu tempo:** com 1 h, 6 h, 12 h ou sem limite por jogada, a sala fica assíncrona:
  quem fecha o jogo segue na mesa, a vez chega por notificação (com lembrete antes do prazo) e as
  salas em andamento aparecem em "Tuas salas".
- **Perfil:** 25 avatares da turma do Gaudério e apelido guardado com PIN (fica só teu e leva o
  perfil para outro aparelho).
- **Admin** em `/admin`: salas abertas, jogadores, acessos e números de uso.
- **Séries e ranking:** melhor de 1, 3, 5 ou 7, com os palitos de cada partida escolhidos na sala. A
  sala marcada "Valendo ranking" conta no ranking da semana, do mês, do ano e de sempre (horário de
  Brasília), da tua turma ou de todo mundo. Cada partida dá um ponto por pessoa que terminou atrás.
- **Mesa:** baralho Heraclio Fournier de 1878 (domínio público), mesa de madeira, vidas como palitos
  de fósforo que queimam, caderneta com o placar anotado à mão, reações rápidas, sons e vibração.
- **Continua de onde parou:** a partida local é salva a cada jogada.
- **PWA:** instala como app pelo navegador, sem loja (Ajustes → Instalar como app, no computador, Android e
  iPhone), e joga contra bots offline.
- Funciona no celular em pé e deitado, no tablet e no desktop: a interface cresce com a tela, e as
  cartas na testa (rodada de 1 carta) ficam grandes, na frente de cada jogador. Aceita teclado: 0–9
  palpitam, ←/→ escolhem a carta, Enter joga, Esc abre o menu.

## Estrutura

```
packages/engine/  regras puras (sem dependências), visões por jogador, bots, GameHost e protocolo
packages/sala/    a sala online sem transporte: lobby, senha, série, ranking, reconexão, validação
apps/worker/      servidor no Cloudflare Workers: um Durable Object por sala, ranking e push
apps/web/         React + Vite + Tailwind + Motion; projetos Capacitor em android/ e ios/
e2e/              testes de ponta a ponta com Playwright (partida local e online completas)
scripts/          geração de assets (cartas, ícones, avatares) e screenshot para revisão visual
docs/             regras, deploy, apps, spec e plano
```

O mesmo `GameHost` roda no navegador (modo local) e no servidor (modo online). O servidor manda para
cada jogador só a visão dele, então nenhuma carta escondida sai do servidor.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | web (5173) + servidor (`wrangler dev`, 8787) em modo desenvolvimento |
| `pnpm test` | testes do engine (inclui fuzz de 150 partidas), da sala online, do Worker e da geometria da mesa |
| `pnpm e2e` | Playwright: partida local, online e três amigos em navegadores isolados, pela interface |
| `E2E_BASE=https://fazquantas.pages.dev pnpm e2e e2e/amigos.spec.ts` | os mesmos testes contra a produção |
| `pnpm lint` / `pnpm typecheck` | ESLint e TypeScript em todo o monorepo |
| `pnpm build` | build do web (PWA) |
| `FUZZ_GAMES=3000 pnpm --filter @fodinha/engine test` | fuzz longo do engine |
| `node scripts/adversarial-player.mjs` | com o `pnpm dev` no ar: joga partidas pela interface em 6 tamanhos de tela (gira, recarrega, abre folhas no meio) e aponta carta fora da tela, encavalada ou escondida |
| `node scripts/scene-shots.mjs <pasta> 390x844,1436x809 cega,mao` | captura cenas de desenvolvimento em vários tamanhos, para revisão visual |

Cenas de desenvolvimento para revisar o visual: `http://localhost:5173/?cena=empardou` (também `mesa8`,
`palpite`, `mao`, `cega`, `cega8`, `muitas`, `fimrodada`, `fimjogo`, `espectador`, `vira`) e `?galeria` com
o baralho inteiro. Os golpes das manilhas ("Quem mata quem": o espadão corta, o bastião bate, o sete de
espadas fura, o sete belo derruba a golpe de moeda e a de copas, com vira, derrama vinho) têm cenas que
jogam uma mão sozinhas: `espadao`, `duelo`, `fraca`, `setespadas`, `setebelo`, `manilhas` e `manilhasvira`.

## Código aberto

- **Licença:** [MIT](LICENSE) para o código e a arte feita para o jogo. Cartas, sons, avatares e
  fontes de terceiros seguem as licenças deles (domínio público, CC0, SIL OFL), listadas em
  [CREDITS.md](CREDITS.md).
- **Contribuir:** problema, ideia ou pull request, do jeito que tu preferir:
  [CONTRIBUTING.md](CONTRIBUTING.md). Quem participa segue o [código de conduta](CODE_OF_CONDUCT.md).
  Agentes de IA: [AGENTS.md](AGENTS.md).
- **Fazer o teu:** o fork roda inteiro no plano gratuito do Cloudflare, e a CI publica sozinha; o
  passo a passo está em [CONTRIBUTING.md → Fazer o teu](CONTRIBUTING.md#fazer-o-teu-fork-publicado).
  Se for publicar para outras pessoas, use outro nome e outra marca: "Faz quantas?" e o Gaudério
  identificam este jogo.
- **Segurança:** relate em privado, como explica o [SECURITY.md](SECURITY.md).

## Produção e apps

- Publicação no Cloudflare (Pages + Workers, plano gratuito) pela CI do GitHub a cada push na `main`:
  [docs/DEPLOY.md](docs/DEPLOY.md).
- Plano de lançamento (web e lojas): [docs/LANCAMENTO.md](docs/LANCAMENTO.md).
- Apps Android e iOS com Capacitor: [docs/MOBILE.md](docs/MOBILE.md).

## Créditos

Cartas, sons, avatares e fontes de terceiros estão em [CREDITS.md](CREDITS.md).
