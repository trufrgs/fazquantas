---
name: regras-fodinha
description: Regras da Fodinha com baralho espanhol implementadas no jogo, com variantes e fontes
owner: "@trufrgs"
last_updated: 2026-09-28
status: active
---

# Regras da Fodinha

> Resumo das regras que o jogo implementa. A regra padrão é a **gaúcha, com manilhas fixas**
> (decisão de 2026-09-27). Termos de mesa usados no jogo (decisão de 2026-09-28): cada disputa de
> cartas é uma **mão** (em outras regiões, "vaza"), cartas iguais **empardam** (em outras regiões,
> "melam") e o carteador é o **pé**. A pesquisa que sustenta as demais escolhas está em [Fontes](#fontes);
> onde as fontes divergem, a divergência virou configuração.

## Objetivo

Acertar, a cada rodada, **exatamente** quantas mãos tu vai fazer. Quem erra perde vidas (palitos):
por padrão, cada um começa com 3 e quem erra perde 1. Vence quem sobrar por último.

## Baralho e força das cartas

Baralho espanhol de 40 cartas: 1 a 7, 10 (sota), 11 (cavalo) e 12 (rei), nos naipes ouros, copas,
espadas e paus. Não é preciso seguir naipe: vence a carta mais forte.

**Gaúcha (padrão do jogo — manilhas fixas, sem vira).** Da mais forte para a mais fraca:

| # | Carta(s) | Apelido |
|---|---|---|
| 1 | 1 de espadas | Espadão |
| 2 | 1 de paus | Bastião |
| 3 | 7 de espadas | Sete de espadas |
| 4 | 7 de ouros | Sete belo |
| 5 | os quatro 3 | |
| 6 | os quatro 2 | |
| 7 | 1 de copas e 1 de ouros | ases falsos |
| 8 | os quatro 12 | reis |
| 9 | os quatro 11 | cavalos |
| 10 | os quatro 10 | sotas |
| 11 | 7 de copas e 7 de paus | setes falsos |
| 12 | os quatro 6 | |
| 13 | os quatro 5 | |
| 14 | os quatro 4 | |

Fora as quatro manilhas, cartas do mesmo nível empatam (o naipe não desempata).

**Variante "Com vira" (manilha variável).** É a versão das fontes escritas de Fodinha. Depois de dar
as cartas, vira-se a carta do topo do monte. As quatro cartas do valor seguinte ao da vira são as
manilhas (circular: 7 → 10, 12 → 1, 3 → 4) e vencem qualquer outra, na ordem zap (paus) > copas >
espadilha (espadas) > pica-fumo (ouros). As demais, da mais fraca para a mais forte: 4, 5, 6, 7, 10,
11, 12, 1, 2, 3.

**Variante mineira (manilhas fixas, sem vira):** zap (4 de paus) > 7 de copas > espadilha (1 de
espadas) > pica-fumo (7 de ouros) > 3 > 2 > 1 > 12 > 11 > 10 > 7 > 6 > 5 > 4.

## A rodada

1. **Cartas:** a 1ª rodada dá 1 carta a cada um; a 2ª, 2; e assim até o máximo (⌊40 ÷ vivos⌋ na
   gaúcha; ⌊39 ÷ vivos⌋ com vira, que reserva uma carta). Depois volta a 1 ("subindo", o serrote) —
   ou desce de volta ("sobe e desce", a pirâmide). Na opção "descendo", começa com o máximo e desce
   até 1, e depois volta ao máximo. Quando alguém é eliminado, a rodada seguinte recomeça do começo
   (1 carta, ou o máximo descendo).
2. **Palpites:** começando pelo jogador à direita do carteador, cada um diz quantas mãos vai fazer.
   O carteador palpita por último — é o **pé** — e não pode escolher o número que faria a soma dos
   palpites bater com o número de cartas. Assim, alguém sempre erra.
3. **Mãos:** quem palpitou primeiro começa a primeira mão. Cada um joga uma carta, sempre para a
   direita. A mais forte leva a mão, e quem leva começa a próxima.
4. **Empate:** se as cartas mais fortes da mão **empardam** (mesma força), ninguém leva a mão e quem
   começou começa de novo. Variantes: as iguais se anulam e leva a maior que sobrou, ou o naipe
   desempata.
5. **Vidas:** quem erra perde 1, erre por quanto errar (padrão desde 29/09/2026, a pedido de quem
   jogou: a partida ficava comprida). Variante: perde a diferença entre o palpite e as mãos que fez.
   Chegou a 0, está fora ("deu pra ti").

## Rodada às cegas

Nas rodadas de 1 carta, ninguém vê a própria carta — só as dos outros ("carta na testa"). Palpita-se
lendo a mesa. Nessas rodadas a regra do pé é dispensada (configurável).

## Fim de jogo

Vence o último com vidas. Se os últimos zeram na mesma rodada, vence quem ficou menos negativo; se
ainda empatar, ninguém ganha perdendo: os empatados voltam com uma vida e o jogo segue (quem ficou mais
negativo sai).

## Configurações disponíveis

Hierarquia (gaúcha, com vira, mineira) · vidas (1–12, padrão 3) · penalidade (1 por erro, o padrão,
ou a diferença) · empate (empardar, ninguém leva, naipe desempata) · rodada às cegas (toda de 1 carta,
só a primeira de 1 carta da partida, nunca) · regra do pé (e se vale na rodada às cegas) · cartas por
rodada (subindo, descendo, sobe e desce) · recomeçar do começo quando alguém sai · teto de cartas ·
tempo por jogada no online.

## Fontes

Pesquisa feita em 2026-09-27. Não há verbete de Fodinha na Wikipedia PT nem no pagat.

**Descrevem a Fodinha:**

- [Copag — Fodinha, regras](https://blog.copag.com.br/regras/fodinha)
- [Ludopedia — Fodinha](https://ludopedia.com.br/jogo/fodinha) ([snapshot](http://web.archive.org/web/20230425015200/https://ludopedia.com.br/jogo/fodinha)) — baralho espanhol, 5 vidas, serrote
- [Portal do Jogador — Conheça o jogo Fodinha](https://portaldojogador.com/conheca-o-jogo-fodinha/) ([snapshot](http://web.archive.org/web/20260118224857/https://portaldojogador.com/conheca-o-jogo-fodinha/)) — baralho espanhol com vira
- [Regulamento Fodinha, JECA 13.1 (CAECA/UFSC)](https://caeca.ufsc.br/regulamentos/Fodinha.pdf)
- [Blog Falta de Criatividade é Fogo — Fodinha (2016)](http://faltadecriatividadeefogo.blogspot.com/2016/02/fodinha.html) — melar, pé dispensado na rodada cega
- [Todosjoga (2012)](https://todosjoga.wordpress.com/2012/03/25/filho-da-puta-35/) — pirâmide
- [Lambô Games — F#DINHA (YouTube)](https://www.youtube.com/watch?v=VKdk_M55r1s)

**Truco (hierarquias):**

- [Wikipedia PT — Truco](https://pt.wikipedia.org/wiki/Truco)
- [Regras do Truco Paulista (UFSC/CASIN)](https://casin.paginas.ufsc.br/files/2010/10/Regras_Truco_Paulista.txt)
- [Clube do Truco — truco paulista](https://clubedotruco.com.br/regras-truco-paulista.html)
- [Truco Online — truco gaudério](https://trucoonline.app.br/blog/truco-espanhol-gauderio)
- [Pagat — Brasil](https://www.pagat.com/national/brazil.html)

**Implementações consultadas (variantes, não tradição):**
[HermanoLeite/fodinha](https://github.com/HermanoLeite/fodinha),
[jpmvale/fdp](https://github.com/jpmvale/fdp/blob/main/docs/02-regras-do-jogo.md),
[yao12310/fodinha](https://github.com/yao12310/fodinha),
[Biazonx/fodinha_jogo](https://github.com/Biazonx/fodinha_jogo).
