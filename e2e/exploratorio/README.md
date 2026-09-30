# Testes exploratórios (rede, abas, aparelhos, motores)

Roteiros de QA que rodam **à mão**, fora da CI, contra o ambiente local (`pnpm dev`) ou contra
qualquer endereço com `BASE=…`. Foram eles que acharam os bugs de conexão da rodada de 29/09/2026
(conexão morta em silêncio levando 1 min para cair, volta automática roubando o lugar de outro
aparelho, quem foi tirado sem rede sentando de novo, painel cobrindo as cartas na testa na mesa cheia).
Depois da v1 validada com gente de verdade, os cenários daqui viram E2E na CI (ver `AGENTS.md`).

```bash
pnpm dev                                   # em outro terminal: web 5173 + worker 8787
node e2e/exploratorio/3-queda.mjs          # todos os cenários do arquivo
node e2e/exploratorio/3-queda.mjs a2 a4    # só alguns
```

Cada roteiro imprime o que viu e, no fim, a lista de **ACHADOS** (vazia = passou). Fotos em
`test-results/exploratorio/`.

## A rede simulada (`lib.mjs`)

O modo offline do Chrome não derruba WebSocket já aberto, então `lib.mjs` intercepta o WebSocket da
sala (`routeWebSocket`) e simula as falhas de verdade de celular:

| Chamada | O que simula |
|---|---|
| `d.aviao(true/false)` | Modo avião: fecha as conexões na hora e recusa novas |
| `d.morta(true)` | Morta em silêncio (túnel, troca de wi-fi para 4G): nada passa, nada fecha, nem para o servidor |
| `d.morta(true, { buraco: true })` | Igual, e as conexões novas ficam penduradas sem abrir |
| `d.rede.atraso = 1500` | Rede lenta: cada mensagem atrasa esse tanto |
| `device(nome, { name: null, preset: false })` | Janela anônima sem nada salvo (primeira visita) |
| `device(nome, { engine: 'webkit', dev: 'iPhone 13' })` | Motor do Safari; `engine: 'firefox'` também |

## Roteiros

| Arquivo | Cenários |
|---|---|
| `1-entrada.mjs` | Convite na janela anônima (pede o nome), primeira visita sem nome, senha, código inexistente, partida já começada, sala cheia (8) |
| `2-aba.mjs` | Criadora cai no lobby, fechar a aba e reabrir, recarregar no meio, duas abas do mesmo aparelho |
| `3-queda.mjs` | Modo avião, oscilação, rede lenta, jogar com a conexão morta, morta em silêncio, buraco negro, celular dormindo |
| `4-aparelhos.mjs` | Tirado pelo anfitrião sem rede, sair com a conexão morta, trocar do celular (morto) para o notebook |
| `5-motores.mjs` | Entrar, jogar, modo avião e recarregar no WebKit e no Firefox (`pnpm exec playwright install webkit firefox`) |
| `6-mesa-cheia.mjs` | Mesa com 8 em celular pequeno (`360`, `se`, `mini`): foto do painel de cantada aberto |
| `7-longe.mjs` | Longe da mesa por muito tempo (`LONGE_MIN`, padrão 3,5): anfitriã no WhatsApp, sala sem ninguém conectado, reabrir o app sem servidor |
| `8-midia.mjs` | Microfone e câmera com os de mentira do Chromium (`device(nome, { microfone: true })`): só câmera, só microfone, os dois, fechar a câmera (a trilha para), rostos nos assentos e vídeo grande na mesa, queda da sala e volta, tudo fechado sem ligações |
| `9-oito.mjs` | A sala cheia: 8 pessoas em celulares diferentes (o máximo da sala), todas de microfone e 4 de câmera (malha de 28 ligações), a nona recusada ("A sala está cheia"), partida inteira no automático (`MAX_MIN`, padrão 10) medindo a mesa de 8 no iPhone 15 e no SE |

Referências de tempo (29/09/2026, local): modo avião volta em ~0,2 s; conexão morta é percebida em
~16 s e volta em ~0,2 s; jogada com a conexão morta avisa em ~6 s; celular que dormiu volta em ~0,3 s.
