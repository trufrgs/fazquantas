---
name: fodinha-design
description: Spec do jogo Fodinha (baralho espanhol) — regras, UX, visual, arquitetura, bots, multiplayer e testes
owner: "@trufrgs"
last_updated: 2026-09-27
status: active
---

# Fodinha — design

## 1. Intenção

**O que foi pedido:** um jogo de Fodinha com baralho espanhol, multiplayer, com design incrível e ao
mesmo tempo simples e intuitivo; regras pesquisadas e implementadas fielmente; webapp numa tecnologia
fácil de empacotar para Android e iOS; jogável localmente contra bots; tudo testado, sem bugs,
acabado do início ao fim (configurações, jogabilidade, visual); infraestrutura já pensada para subir
num servidor com multiplayer; reaproveitar o que já existe pronto.

**Fases:**

| Fase | Entrega | Neste ciclo? |
|---|---|---|
| 1 | Jogo completo rodando local: contra bots **e** online em rede local (servidor Node rodando na máquina) | ✅ |
| 2 | Deploy do servidor + web num host público | só preparado (Dockerfile, docs) |
| 3 | Apps Android/iOS nas lojas | só preparado (Capacitor configurado) |

**Critérios de sucesso da fase 1:**

1. `pnpm install && pnpm dev` abre o jogo em `http://localhost:5173`; 1 toque em "Jogar agora" começa
   uma partida contra bots.
2. Partida completa (até sobrar um vencedor) sem erro, com todas as regras e variantes configuráveis.
3. Online: dois navegadores (ou celulares na mesma rede) jogam na mesma sala, com bots completando a
   mesa, reconexão e tempo de jogada.
4. Testes automatizados verdes: engine (unitário + fuzz de milhares de partidas), servidor
   (integração com sockets reais), E2E no navegador (partida local e online completas).
5. Visual revisado por screenshot em celular retrato, paisagem e desktop.

**Suposições (não ditas pelo pedido):** idioma pt-BR; jogadores brasileiros; sem contas/login
(apelido local); sem dinheiro/apostas reais; sem chat livre (só reações prontas, para evitar moderação).

## 2. Regras

> **Decisão do dono (2026-09-27): a regra padrão é a gaúcha, com manilhas fixas.** A pesquisa
> (fontes em `docs/REGRAS.md`) mostrou que as fontes escritas de Fodinha usam vira com manilha
> variável; essa versão fica disponível como variante ("Com vira").

### 2.1 Regra padrão ("Gaúcha")

- **Baralho:** espanhol de 40 cartas — 1 a 7, 10 (sota), 11 (cavalo), 12 (rei); ouros, copas,
  espadas e paus. Sem vira.
- **Jogadores:** 2 a 8 (3 a 8 recomendado).
- **Vidas:** 5 para cada um.
- **Força (fixa), da maior para a menor:** 1 de espadas (espadão) > 1 de paus (bastião) > 7 de
  espadas > 7 de ouros > 3 > 2 > 1 de copas e 1 de ouros (ases falsos) > 12 > 11 > 10 > 7 de copas e
  7 de paus (setes falsos) > 6 > 5 > 4. Fora as quatro manilhas, naipe não conta.
- **Sem obrigação de seguir naipe.**
- **Carteador** sorteado na 1ª rodada e passa para a direita; tudo gira para a direita
  (anti-horário).
- **Palpites:** do jogador à direita do carteador até o carteador (o **pé**), um por vez, públicos,
  de 0 a n. O pé não pode palpitar o número que faria a soma dos palpites bater com o número de
  cartas (quando esse número está entre 0 e n).
- **Vazas:** quem palpitou primeiro puxa a 1ª; a maior carta leva; quem leva puxa a próxima.
- **Empate ("melar"):** cartas de mesma força se anulam e vence a maior restante; se todas se
  anulam, ninguém leva e quem puxou puxa de novo.
- **Pontuação:** cada um perde `|palpite − vazas feitas|` vidas; quem chega a 0 sai.
- **Progressão ("serrote"):** 1, 2, 3… até o máximo (⌊40 ÷ vivos⌋) e volta a 1; também recomeça em
  1 quando alguém é eliminado.
- **Rodadas de 1 carta:** às cegas ("carta na testa") — cada um vê a carta dos outros, não a
  própria. Nessas rodadas a regra do pé é dispensada.
- **Fim:** vence o último com vidas. Se os últimos zeram juntos, vence quem ficou menos negativo;
  persistindo, empate.

### 2.2 Variantes (configurações da partida)

| Configuração | Opções | Padrão |
|---|---|---|
| Hierarquia | Manilhas fixas gaúchas (espadão, bastião, 7 de espadas, 7 de ouros; sem vira) · Com vira (manilha variável: a carta seguinte à vira; paus > copas > espadas > ouros) · Manilhas fixas mineiras (4 de paus, 7 de copas, ás de espadas, 7 de ouros; sem vira) | Gaúcha |
| Vidas iniciais | 1–12 | 5 |
| Penalidade | Diferença · 1 vida por erro | Diferença |
| Empate | Melar (anulam, vence a próxima) · Ninguém leva · Naipe desempata | Melar |
| Rodada às cegas | Toda rodada de 1 carta · Só a primeira · Nunca | Toda de 1 carta |
| Regra do pé | Liga/desliga | Liga |
| Regra do pé na rodada às cegas | Vale · Dispensada | Dispensada |
| Progressão | Serrote (volta a 1) · Pirâmide (sobe e desce) | Serrote |
| Recomeçar em 1 quando alguém sai | Liga/desliga | Liga |
| Máximo de cartas | Automático · 3 · 5 · 7 · 9 | Automático |
| Tempo por jogada (online) | Sem limite · 15 s · 30 s · 60 s | 30 s |

Presets: **Gaúcha** (padrão, acima), **Com vira** (manilha variável), **Rápida** (gaúcha com
3 vidas e máximo 5 cartas).

### 2.3 Detalhes de implementação

- Na tela, o próximo jogador fica à sua direita (sentido anti-horário).
- Jogada forçada (uma carta só, inclusive a rodada às cegas) é feita automaticamente após uma pausa
  curta.
- Melar: removem-se todas as cartas cuja força aparece mais de uma vez; vence a maior das restantes.
- Termos da interface: palpite, fazer (vazas), pé, vira, manilha, melou.

## 3. Experiência (UX)

### 3.1 Princípios

1. **Zero atrito:** 1 toque em "Jogar agora" = partida contra 3 bots com a regra padrão.
2. **A mesa ensina:** mão ordenada por força, manilhas marcadas com ★, carta que está vencendo a vaza
   destacada, número proibido do pé explicado no próprio botão, progresso "fez/pediu" em bolinhas.
3. **Estado legível num relance:** vidas em corações, aposta e vazas por jogador, de quem é a vez
   (anel pulsando + cronômetro), carteador marcado.
4. **Suculento, mas rápido:** animação de distribuir, jogar, recolher a vaza, perder vida; som e
   vibração; velocidade ajustável e pular pausas.

### 3.2 Telas

- **Início:** logo, perfil (avatar + apelido), "Jogar agora", "Contra bots" (personalizar), "Online
  com amigos", "Como jogar", ajustes.
- **Nova partida (bots):** nº de jogadores (2–8), dificuldade (fácil/médio/difícil), preset + regras.
- **Online:** criar sala (código de 4 letras + link de convite) ou entrar com código. **Sala:**
  assentos, anfitrião adiciona/remove bots, ajusta regras, começa (mín. 2 humanos ou 1 humano + bots).
- **Mesa:** barra superior (menu, rodada/cartas/sentido, placar), mesa oval com oponentes ao redor,
  vaza no centro (cada carta à frente de quem jogou), vira + manilha (modo paulista), sua mão embaixo
  em leque, painel de aposta como folha inferior.
- **Fim da rodada:** apostou × fez × vidas perdidas, eliminações, próxima rodada; avança sozinho com
  contagem regressiva ou no toque.
- **Fim de jogo:** vencedor, ranking, estatísticas, "Jogar de novo".
- **Placar:** vidas + histórico por rodada.
- **Como jogar:** regras em cartões curtos com cartas de verdade na hierarquia.
- **Ajustes:** som, vibração, velocidade (normal/rápida/turbo), ordenar mão (força/naipe), dicas,
  tema da mesa, créditos/licenças.

### 3.3 Interação

- Carta: toque seleciona (sobe), segundo toque joga; arrastar para cima também joga.
- Aposta: toque no número confirma.
- Desktop: teclas 0–9 apostam; ←/→ escolhem carta; Enter joga.
- Dicas (opcional): sugestão de aposta e de carta vindas do bot médio.
- Eliminado no modo local: vira espectador com todas as mãos abertas e botão de acelerar.

## 4. Direção visual

Tema **"Galpão"**: rústico-moderno, quente, gaúcho sem caricatura. Feltro verde erva-mate com textura
sutil, borda de madeira escura com filete de latão, dourado como cor de destaque, terracota para
alerta. Cartas próprias em SVG (leves e nítidas em qualquer tamanho): face creme, cores tradicionais
dos naipes (ouros dourado, copas vermelho, espadas azul, paus verde), a "pinta" do baralho espanhol
(filete da moldura contínuo em ouros, com 1, 2 e 3 interrupções em copas, espadas e paus), figuras
estilizadas com emblema e nome (SOTA/CAVALO/REI). Verso bordô com treliça de latão e medalhão.
Tipografia com personagem para títulos e uma sans legível para interface, ambas embutidas (funciona
offline e no app). Movimento com física de mola; respeita `prefers-reduced-motion`.

## 5. Arquitetura

### 5.1 Escolhas técnicas (o que reaproveitamos)

| Necessidade | Escolha | Por quê |
|---|---|---|
| App web → Android/iOS | **Vite + React + TypeScript**, empacotado com **Capacitor 8** | O build web vira o app nativo sem reescrever |
| Tempo real | **socket.io 4** (servidor Node) | salas, reconexão automática, fallback; maduro |
| Animação | **Motion** (ex-Framer Motion) | `layoutId`/AnimatePresence resolvem carta voando da mão para a mesa |
| Estado no cliente | **zustand** | simples, sem boilerplate |
| Estilo | **Tailwind CSS 4** + CSS próprio para mesa/cartas | velocidade + controle |
| Áudio | **howler.js** + sons CC0 (Kenney) | destrava áudio no mobile, sprites |
| Avatares | **DiceBear** (estilo CC0) | avatares gerados por semente, sem assets |
| Confete | **canvas-confetti** | vitória |
| Ícones de UI | **lucide-react** | consistente, leve |
| Validação de mensagens | **zod** | servidor nunca confia no cliente |
| Testes | **Vitest** (engine/servidor) + **Playwright** (E2E) | |

Descartados: **boardgame.io** (parado na 0.50.2 desde 2022; bots só no cliente, sem bot em sala
online); **Colyseus** (ótimo para sincronização de estado em tempo real, mas nosso jogo é por turnos
com mãos ocultas — mandar a visão de cada jogador por socket.io é mais simples). O motor de regras é
próprio (nenhuma lib implementa Fodinha) e agnóstico de transporte, então trocar o transporte depois
(Colyseus, Durable Objects) é barato.

### 5.2 Monorepo (pnpm workspaces)

```
fodinha/
  packages/engine/   @fodinha/engine — regras puras, visões, bots, host, protocolo
  apps/web/          @fodinha/web    — React + Vite + Capacitor (android/ios)
  apps/server/       @fodinha/server — Node + socket.io (+ serve o build web em produção)
  e2e/               Playwright
  docs/              spec, plano, regras, deploy, mobile
```

### 5.3 Engine (`@fodinha/engine`)

Puro, determinístico (PRNG com semente no estado), sem dependências de runtime.

- `cards` — naipes, valores, id compacto (`E1` = ás de espadas, `O7`, `C12`, `P3`), nomes em pt-BR.
- `hierarchy` — força de cada carta por modo (gaúcha fixa, paulista com vira), manilhas e apelidos.
- `rules` — tipo `Rules`, padrões, presets, validação.
- `game` — `createGame(config)`, `applyAction(state, action)`, `legalBids`, `legalCards`,
  resolução de vaza, progressão de rodadas, pontuação, fim de jogo. Fases: `bidding` → `playing` →
  `trickEnd` → … → `roundEnd` → (`bidding` | `gameOver`). Ação de sistema `continue` avança
  `trickEnd`/`roundEnd` (o host chama após a pausa de animação).
- `view` — `getPlayerView(state, playerId, opts)`: esconde mãos alheias; na rodada às cegas esconde a
  própria e mostra as dos outros; espectador vê só o público (ou tudo, no modo local).
- `bots` — fácil (heurística + ruído), médio (heurística de probabilidade), difícil (Monte Carlo
  com amostragem das mãos ocultas e rollouts; inferência Bayesiana na rodada às cegas; leve incentivo
  a atrapalhar os outros). Bots só enxergam a própria visão (não trapaceiam).
- `host` — `GameHost`: orquestra engine + bots + pausas + tempo de jogada + jogada automática de
  quem caiu. Relógio injetável (testes rodam instantâneos). **O mesmo host roda no navegador (modo
  local) e no servidor (modo online).**
- `protocol` — tipos das mensagens cliente↔servidor.

### 5.4 Servidor (`@fodinha/server`)

- HTTP + socket.io; `/health`; em produção também serve `apps/web/dist`.
- `RoomManager`: salas por código de 4 caracteres (sem I/O/0/1), até 8 assentos (humano ou bot),
  anfitrião, regras, status (`lobby`/`playing`/`finished`), `GameHost` da partida.
- Identidade: ao criar/entrar, o servidor emite `playerId` + `token` (aleatório); o cliente guarda por
  sala e reconecta com ele. Queda durante o jogo: o assento continua, o host joga automaticamente na
  vez dele até voltar. Anfitrião que sai passa a coroa.
- Mensagens validadas com zod; limite de taxa por socket; limpeza periódica de salas ociosas.
- Configuração por env: `PORT`, `CORS_ORIGINS`, `STATIC_DIR`.
- Escala: uma instância aguenta milhares de salas por turno; para escalar horizontalmente, fatiar por
  código de sala (documentado).

### 5.5 Cliente (`@fodinha/web`)

- `GameConnection` único para a UI: `{ view, send(action), … }` — implementado por `LocalConnection`
  (host no navegador) e `OnlineConnection` (socket).
- A UI compara visões consecutivas para disparar animações e sons.
- Navegação por estado (sem rotas de URL; funciona igual no Capacitor); convite por `?sala=CODIGO`.
- Ajustes persistidos em `localStorage`.
- Capacitor: `capacitor.config.ts`, plataforma Android gerada; iOS documentado (precisa de Xcode).
- PWA (instalável, offline para jogar contra bots) só no build web.

## 6. Testes

- **Engine (Vitest):** hierarquias, anulação, regra do pé, progressão, pontuação, eliminação
  simultânea, visões (nada vaza), rodada às cegas; **fuzz**: milhares de partidas bot×bot com regras,
  nº de jogadores e sementes aleatórios, checando invariantes (40 cartas conservadas, vazas = cartas,
  vidas coerentes, sempre termina).
- **Host:** partidas com relógio falso, bots, timeout, jogador desconectado.
- **Servidor:** integração com socket.io-client real: criar/entrar/sair, bots, começar, partida
  inteira, reconexão, anfitrião saindo, entrada inválida.
- **E2E (Playwright):** partida local completa clicando na UI; partida online com dois contextos;
  zero erro no console; screenshots em celular/desktop para revisão visual.

## 7. Fora de escopo agora

Contas/login, ranking global, chat livre, loja/monetização, notificações push, deploy público,
publicação nas lojas.

## 8. Riscos

- **Nome nas lojas:** "Fodinha" contém palavrão; Apple/Google podem exigir classificação etária ou
  outro nome de exibição na fase 3.
- **Regras regionais:** variam muito; mitigado com variantes configuráveis e presets.
- **iOS:** gerar/compilar o projeto precisa de Xcode (não instalado nesta máquina).
