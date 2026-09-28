---
name: regras-fodinha
description: Regras da Fodinha com baralho espanhol implementadas no jogo, com variantes e fontes
owner: "@trufrgs"
last_updated: 2026-09-27
status: active
---

# Regras da Fodinha

> Resumo das regras que o jogo implementa. A pesquisa que sustenta cada escolha está em
> [Fontes](#fontes); onde as fontes divergem, a divergência virou configuração.

## Objetivo

Acertar, a cada rodada, **exatamente** quantas vazas você vai fazer. Quem erra perde vidas. Vence
quem sobrar por último.

## Baralho e força das cartas

Baralho espanhol de 40 cartas: 1 a 7, 10 (sota), 11 (cavalo) e 12 (rei), nos naipes ouros, copas,
espadas e paus. Não é preciso seguir naipe: vence a carta mais forte.

**Com vira (padrão).** Depois de dar as cartas, vira-se a carta do topo do monte. As quatro cartas do
valor seguinte ao da vira são as **manilhas** (circular: 7 → 10, 12 → 1, 3 → 4) e vencem qualquer
outra, nesta ordem:

| Manilha | Naipe |
|---|---|
| Zap | paus |
| Copas | copas |
| Espadilha | espadas |
| Pica-fumo | ouros |

As demais, da mais fraca para a mais forte: **4, 5, 6, 7, 10, 11, 12, 1, 2, 3** (naipe não desempata).

**Variantes com manilhas fixas (sem vira):**

- **Gaúcha** (truco gaudério): espadão (1 de espadas) > bastião (1 de paus) > 7 de espadas > 7 de ouros
  > 3 > 2 > 1 de copas e de ouros > 12 > 11 > 10 > 7 de copas e de paus > 6 > 5 > 4.
- **Mineira** (truco mineiro): zap (4 de paus) > 7 de copas > espadilha (1 de espadas) > pica-fumo
  (7 de ouros) > 3 > 2 > 1 > 12 > 11 > 10 > 7 > 6 > 5 > 4.

## A rodada

1. **Cartas:** a 1ª rodada dá 1 carta a cada um; a 2ª, 2; e assim até o máximo (⌊39 ÷ vivos⌋ com vira,
   ⌊40 ÷ vivos⌋ sem vira). Depois volta a 1 ("serrote") — ou desce de volta ("pirâmide"). Quando
   alguém é eliminado, a rodada seguinte recomeça em 1.
2. **Palpites:** começando pelo jogador à direita do carteador, cada um diz quantas vazas vai fazer.
   O carteador palpita por último — é o **pé** — e não pode escolher o número que faria a soma dos
   palpites bater com o número de cartas. Assim, alguém sempre erra.
3. **Vazas:** quem palpitou primeiro puxa a primeira vaza. Cada um joga uma carta, sempre para a
   direita. A mais forte leva, e quem leva puxa a próxima.
4. **Empate:** cartas de mesma força **melam** (se anulam) e vence a maior restante. Se todas melam,
   ninguém leva e quem puxou puxa de novo.
5. **Vidas:** cada um perde a diferença entre o palpite e as vazas que fez. Chegou a 0, está fora.

## Rodada às cegas

Nas rodadas de 1 carta, ninguém vê a própria carta — só as dos outros ("carta na testa"). Palpita-se
lendo a mesa. Nessas rodadas a regra do pé é dispensada (configurável).

## Fim de jogo

Vence o último com vidas. Se os últimos zeram na mesma rodada, vence quem ficou menos negativo; se
ainda empatar, é empate.

## Configurações disponíveis

Hierarquia (com vira, gaúcha, mineira) · vidas (1–12) · penalidade (diferença ou 1 por erro) ·
empate (melar, ninguém leva, naipe desempata) · rodada às cegas (toda de 1 carta, só a primeira,
nunca) · regra do pé (e se vale na rodada às cegas) · progressão (serrote ou pirâmide) · recomeçar
em 1 quando alguém sai · teto de cartas · tempo por jogada no online.

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
