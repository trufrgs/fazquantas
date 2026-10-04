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
- **Zoar os amigos é o jogo.** "O jogo é focado em diversão entre amigos": animação exagerada, coisa
  que surpreende, provocação de bar (o grito da manilha, a tragada impaciente, o carimbo em quem
  saiu), pedido do Thomas em 01/10/2026. Quem demora pode até ficar com a tela difícil de ver. O que
  não pode: mexer em regra, palito ou ponto, e mostrar carta escondida.
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

## A mesa na tela

- **Tamanho do espaço** (pedido do Thomas em 30/09/2026: "usar o espaço de forma inteligente e
  dinâmica"): `mesaDimensionada` (`components/table/layout.ts`) testa os avatares de 84 a 36 px (com
  alguém de câmera aberta, o rosto vai de 136 a 48) e escolhe, nesta ordem: assentos na tela sem se
  encostar, cartas da mão longe deles, carta na testa legível (56 px), painel de palpite inteiro; daí,
  a carta da mesa a até 8% da maior possível (com câmera, 20%: o rosto vem antes) e o maior avatar,
  nunca menor que o fixo de antes quando dá (`pisoDoAvatar`). Testes: `layout.test.ts`, todas as telas
  com 2 a 8 na mesa, com e sem câmera.
- **Cartas da mão encavaladas** (escolha do Thomas em 30/09/2026, entre três jeitos desenhados): a
  carta da mesa cresce até 60% acima da base (`trickCardFor`) e pode encavalar nas outras, como na
  mesa de verdade, mas o canto com o número de todas fica à mostra (`numerosAMostra`). Cada carta vai
  o mais perto que dá de quem jogou (`aproximarDosDonos`, só na mesa que aparece): pela posição fica
  evidente de quem é cada uma (um rostinho do dono em cima da carta chegou a entrar e saiu no mesmo
  dia: atrapalhava, o Thomas, 30/09/2026). Com 5 a 8 na mesa, a carta passou de 47–52 px para 75–82 px
  no iPhone.
- **Carta na testa:** cada uma fica com o dono, no arranjo natural (quem senta na fileira de cima
  segura embaixo do assento; nas colunas, para dentro), longe do alto da mesa. Outro arranjo só entra
  se render cartas 15% maiores (`ARRANJOS` em `layout.ts`): pelo tamanho, a carta de quem senta no alto
  ia para o lado dele, encostada no cabeçalho (print do Thomas, 30/09/2026). Cena: `?cena=cega4`.
- **A última carta aparece inteira:** quando a mão fecha, a vencedora espera 0,6 s para subir por cima
  (`SEGURA_A_VENCEDORA` em `TrickArea`) e a última carta fica por cima de todas nesse instante; o
  anfitrião dá esse tempo a mais na pausa da mão (`lastCardMs`, 600 ms), então o destaque da
  vencedora dura o mesmo de antes (pedido do Thomas em 30/09/2026).
- **O alto da mesa** (escolha do Thomas em 30/09/2026, opção A): ☰, a rodada no meio (tocar abre a
  caderneta) e, com gente na sala, microfone e câmera, um botão para cada. As três frases favoritas
  (★ no quadro) e o "+" ficam numa pílula no canto de baixo da mesa, à direita, perto do polegar; na
  tua vez de cantar o painel cobre o canto e ela some até tu cantar. A mesa reserva esse canto
  (`pilulaDeFrases` em `layout.ts`): assento, carta da mesa e carta na testa não vão ali, e a tua carta
  desce um pouco para a esquerda. Na mesa baixa (celular deitado) as frases sobem para o alto. O
  quadro tem 12 frases (três fileiras); o "é galo" sugere as cartas da mão, a que está levando
  primeiro (é ela que passa), e o genérico; o 🐓 da pílula manda a que está levando.
- **Fumaça da demora** (pedido do Thomas em 01/10/2026): aos 9 s de demora os outros acendem o
  palheiro (`DEMORA_MS`), com baforadas grossas, e a fumaça enche a mesa na tela de todos
  (`components/table/Fumaca.tsx`). Aos 40 s somem assentos, palitos e cantadas; ficam por cima da
  fumaça só o que quem joga precisa (cartas da mão que está na mesa, cartas na testa, vira, painel de
  cantar) e a mão dele, que fica fora da mesa. Dos 45 s em diante um véu passa por cima de tudo e fica
  difícil de ver, sem fechar de todo. Jogou, some num sopro. Não tem na sala de vez longa, em câmera
  rápida nem com "reduzir movimento". Roteiro: `e2e/exploratorio/10-fumaca.mjs`.
- **Quem saiu vai para a lápide:** o assento vira túmulo, com o rosto de retrato (em preto e branco)
  e, no lugar dos palitos, o que matou ("cantou 3, fez 0"). De câmera aberta, o rosto leva o carimbo
  "Deu pra ti" (a palavra da mesa; "loser" ficou fora do clima, o Thomas, 02/10/2026), que no vídeo
  ampliado bate no canto, com pancada (`components/ui/Carimbo.tsx`).
- **Plateia e patrões** (pedido do Thomas em 02/10/2026): quem chega com a partida rolando ou com a
  mesa cheia senta na plateia (`PLATEIA_CAPACITY`, 6): vê a mesa sem mão, conversa, abre a câmera (em
  preto e branco, no canto de baixo à esquerda, que a mesa reserva) e pede para jogar a próxima. Os
  patrões veem o pedido no alto da mesa (ou na sala) e aceitam; quem foi aceito senta na próxima
  partida, ou na hora se a sala está no lobby, enquanto houver lugar. Patrão é quem manda na mesa
  (chapéu ao lado do nome): o anfitrião e quem um patrão fez patrão (o chapéu na lista da sala);
  passar o chapéu é fazer outro patrão e sair de patrão, e aí a coroa não volta sozinha para quem
  criou. A senha da sala também vale no meio da partida (menu ☰ dos patrões). Servidor em
  `packages/sala/src/sala.ts` (`plateia` no assento humano, `patroes`), testes em
  `packages/sala/test/plateia.test.ts`, roteiro `e2e/exploratorio/11-plateia.mjs`.
- **Zoar o amigo** (2ª leva do caderno, 04/10/2026): tocar no rosto de alguém abre o menu do amigo
  (`zoeira/MenuDoAmigo.tsx`): atirar tomate, ovo, chinelo ou bergamota (três por rodada; mancha o rosto
  por uns segundos), carimbar uma das tuas frases favoritas na testa dele, cutucar quem está demorando
  na vez (o aparelho dele vibra) e ver a câmera grande. Segurar uma frase favorita faz ela crescer até
  o grito (o balão cresce e a vogal estica: "CAGÃÃÃÃO!"). Jogar a carta num arrasto rápido bate na mesa
  (tremor e rachadura). "Virar a mesa" (menu ☰, ou chacoalhar o celular) vira a mesa de todos, uma vez
  por partida. Tudo por um canal só (`game:zoar` → `game:zoeira`), com os limites em
  `packages/engine/src/zoeira.ts` (`ControleDaZoeira`, igual no servidor e contra os bots), e no
  máximo três coisas voando ao mesmo tempo. Roteiro: `e2e/exploratorio/12-zoar.mjs`.
- **A noite e as escondidas** (3ª leva, 04/10/2026): no fim de jogo, os troféus da noite (cagão,
  guloso, açougueiro, tartaruga, cumadre, matraca, vidente e a fênix, que ganhou depois de três
  rodadas no último palito; no máximo quatro, cada um com uma pessoa) e o Jornal do Bolicho, que vira
  imagem para mandar no grupo (`zoeira/noite.ts`, `JornalDoBolicho.tsx`). No palco, só em tempo morto:
  a cuia gira e aponta quem dá as cartas no começo, o duelo de galpão quando sobram dois, e o baralho
  que escapa da mão de quem dá (uma vez a cada umas 18 rodadas). Atravessam a mesa por baixo das
  cartas: o galo quando alguém canta "é galo", o gato preto na sexta-feira 13, o espeto no 24 de abril
  e o galo da madrugada (3h–6h). Na Semana Farroupilha todo mundo usa lenço. Lances raros viram fala do
  narrador: as quatro manilhas na mesma mão, três empates seguidos. Para olhar no desenvolvimento:
  `?zoeira=duelo|cuia|tropeco|galo|gato|espeto`.
- **A mesa que debocha sozinha e os refinos** (4ª leva, 04/10/2026; o Thomas pediu que os refinos
  seguissem a lógica de até aqui sem perguntar): o golpe de cada avatar sem palavra (a vó, o zorrilho,
  o bugio, o garnisé, o quero-quero e o gringo têm o seu, no menu do amigo, contando como tiro; na
  Capivara plena o que se atira escorrega sem sujar); a peleia do empate virou tranco seco (as cartas
  se chocam, faísca curta e poeira, sem estrela nem soco de gibi); a manilha que perde a mão queima no
  lugar quando a mão sai da mesa (fogo subindo, sem letreiro, sem nariz de palhaço: o nariz é da
  máscara); a mão que decide e o corte de novela são uma coisa só: na última mão da rodada, se ela
  decide quem sai (`porUmFio`, conta pública), a última carta aparece inteira, a imagem corta para o
  rosto de quem está por um fio (câmera ou avatar suando) com faixas de cinema, legenda de telejornal
  (palitos e cantada, nunca o resultado) e o bombo, e volta para a mesa quando a vencedora sobe (o
  anfitrião espera `decisiveMs`). Máscaras do fim da rodada (focinho de porco de quem fez mais, nariz de
  palhaço de quem fez menos, no avatar e na câmera), a galinha de quem cantou zero três vezes seguidas,
  os corações de cumadre (empardou duas vezes na rodada), o cusco caramelo na cadeira de quem caiu
  ou sumiu (com a desculpa na plaquinha), a baforada do palheiro na cara de quem demora, e as frases
  com efeito: as que são sobre quem manda mexem no rosto dele ("Que barbada!" óculos, "Mas bah!" e
  "Barbaridade!" o queixo, o palavrão fumaça nas orelhas); as que são sobre outro só têm efeito
  carimbadas no alvo ("Chorão!" lágrimas, "Chinelão!" o chinelo, "Guloso!" o focinho). O "PROCURA-SE"
  da câmera do líder ficou de fora: a coroa já diz isso. Cenas: `?cena=decide|peleia|lixo`,
  `?zoeira=cumadre|corte`, `&mascaras=1`.
- **O microfone, a voz e a noite** (5ª leva, 04/10/2026): a frase na tua voz (Ajustes, "Frases na tua
  voz": até 2 s por frase favorita, IMA ADPCM a 9,6 kHz feito no próprio app para não depender do codec
  de cada navegador e caber em `MAX_MESSAGE_BYTES`; fica no aparelho e, na sala, só na memória do
  servidor, `voz:frase`); soprar o microfone ou abanar com o dedo abre a fumaça na tua tela; o
  gargalhômetro (dois microfones saltando juntos sobre o próprio fundo logo depois da mão) bate o selo
  "lance da noite" na carta e vai para o fim de jogo e o jornal; a voz do além (eco em quem saiu, fora
  do iPhone até testar num aparelho de verdade); a foto do vexame (a cara de quem saiu de câmera aberta,
  tirada em cada aparelho, no resumo, no fim de jogo e no jornal); o mural da vergonha no ranking
  (lanterna, maior freguês, recordista de bituca, virador de mesa; contado pela sala e somado pelo
  `RankingDO`); a piada interna por apelido (admin, Jogadores, "Piada interna": a faixa da chegada e o
  apelido de zoeira na sala e no menu do amigo; fica no `ContasDO`, fora do código); o barulho de
  bolicho por baixo do tango (conversa, copo e sinuca, CC0; cala com microfone aberto). O rádio com
  estações ficou de fora: não há milonga nem vaneira com licença que permita uso comercial (a regra
  do `CREDITS.md`). Microfone: só volume, nada gravado; contas em `zoeira/microfone.ts` (testadas).
- **Zoeira: uma coisa de cada vez em cada lugar.** O Thomas escolheu dezenas de ideias no caderno de
  zoeira (02/10/2026) com uma condição: o excesso não pode sobrecarregar nem atrapalhar a jogada, e as
  opções não podem se confundir entre si. As regras moram em `components/table/zoeira/diretor.ts` e
  valem para tudo o que entrar depois:
  - *enfeite* (estado do assento, cada um no seu ponto): coroa do líder em palitos e lanterna do
    último, chama da mão quente (3+ acertos seguidos) ou véu azul do pé-frio (3+ erros), balanço do
    borracho (cada palito perdido é um trago), lápide, a galinha de quem só canta zero;
  - *máscara* (o meio do rosto, uma por rosto): focinho ou nariz, do fim da rodada até a primeira
    carta da seguinte; jogando carta, os rostos ficam limpos;
  - *cena de assento* (um instante em cima de um rosto, no máximo duas na mesa, a mais pesada
    entra): a chinelada em quem sai, a vaca em quem erra por dois ou mais, a traíra em quem mata a
    carta que alguém cantou "é galo";
  - *palco* (o meio da mesa, só em tempo morto): o cartão fidelidade do freguês (cinco cartas mortas
    pelo mesmo dono), o duelo, a cuia, o tropeço e o corte de novela (que tira o que estiver lá);
  - *faixa* (o único letreiro): o narrador de galpão, com ditado gaúcho, só em tempo morto e no
    máximo duas falas por rodada, e o coro (três mandam a mesma frase em cinco segundos);
  - o cinzeiro da espera junta as bitucas no canto e a conta sai no fim de jogo, com o freguês da
    noite.
  Nada pega toque nem cobre a mão ou o painel; em câmera rápida não acontece nada; com "reduzir
  movimento" ficam os enfeites parados e a faixa. **Sem letrinha de gibi**: onomatopeia ("pá!",
  "cocoricó") o Thomas achou brega; palavra só quando é a piada (carimbo, epitáfio, ditado). Desenho
  novo sai na língua dos avatares (`zoeira/desenhos.tsx`), nunca emoji. "Patrão" é quem manda na mesa
  (a sala); quem lidera em palitos é o "líder". Para olhar sem esperar o lance, no desenvolvimento:
  `?cena=mao&zoeira=vaca|traira|chinelada|fala|coro|fregues|cinzeiro` e `&enfeites=1`.
- **O alto da sala de espera:** voltar, título, microfone e câmera, som. O convite fica junto do
  código: com tudo no alto, o voltar amassava no celular depois da partida (com a conversa aberta).
  O voltar das telas de menu nunca encolhe (`ScreenFrame`); quem encolhe é o título.
- **Resumo da rodada:** o × esconde o desta rodada; "Não mostrar mais" desliga (volta nos ajustes e no
  menu ☰). No jogo local sem resumo, a rodada seguinte começa em 1,5 s.
- **Som ao sair do app:** o iPhone só tira o ícone de som da tela de início quando o áudio para de
  verdade. Ao esconder o jogo, os efeitos suspendem (`dormirAudio`), a conversa pausa (`midia.dormir`)
  e o tango vai fora (não só pausa); ao sair da sala, o medidor de fala fecha. O toque na volta acorda.

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

## Microfone e câmera

- Pedidos do Thomas em 30/09/2026 (voz, depois vídeo): numa sala online com gente, cada um escolhe o
  que abre, **nada, só o microfone, só a câmera ou os dois** (botões no alto da sala e da mesa, e no
  menu ☰), e a sala toda ouve e vê o que foi aberto. A câmera põe o rosto no lugar do avatar, maior (os
  assentos crescem com o espaço, ver "A mesa na tela"), e tocar no rosto abre o vídeo grande.
- O áudio e o vídeo vão **direto entre os aparelhos** (WebRTC em malha, até 8), com
  `@thaunknown/simple-peer` carregado só quando alguém abre algo (`lib/midia.ts`; precisa do pacote
  `events` no navegador). Duas pessoas se ligam quando uma delas abriu algo; quem liga é o de id menor;
  sem trickle. Abrir ou fechar a câmera renegocia (a trilha para, a luz apaga); o microfone silencia na
  hora e solta o aparelho depois de 10 s fechado. Cada ligação tem sessão (oferta de outra sessão
  recomeça); ligação que não fecha em 12 s recomeça.
- A sala só diz o que cada um abriu (`RoomState.midias`, que sobrevive à hibernação) e repassa
  `midia:sinal`. `midia:ice` devolve STUN públicos e, com os segredos `TURN_KEY_ID` e `TURN_KEY_TOKEN`,
  credenciais TURN do Cloudflare Realtime (1.000 GB por mês de graça) para NAT fechado (alguns 4G).
- O `_headers` libera câmera e microfone (`camera=(self), microphone=(self)`). Com alguém de microfone
  aberto, o tango abaixa; "Ouvir a conversa" (menu ☰, som da sala) cala as vozes dos outros. Roteiro:
  `e2e/exploratorio/8-midia.mjs`.

## Segredos

- **Nunca** em arquivo do repositório, em argumento de comando (`argv`) ou em log.
- Fonte da verdade: **segredos do GitHub** (`CLOUDFLARE_API_TOKEN`, `VAPID_PRIVADO`, `ADMIN_SENHA`,
  `TURN_KEY_ID`, `TURN_KEY_TOKEN`); a CI publica o Worker já com os do Worker (`wrangler deploy
  --secrets-file`, uma publicação só: cada publicação reinicia as salas abertas).
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
