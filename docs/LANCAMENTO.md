---
name: lancamento-fazquantas
description: O que já está no ar do Faz quantas?, como chamar a gurizada e os passos para as lojas
owner: "@trufrgs"
last_updated: 2026-09-28
status: active
---

# Lançamento

Projeto pessoal: contas pessoais (GitHub `trufrgs`, Cloudflare pessoal), sem ligação com a
Aegro, e só serviços gratuitos enquanto der.

## No ar (web)

- Jogo: <https://fazquantas.pages.dev>. Instala como app pelo navegador (PWA), sem loja, no computador
  (Windows, Mac, Linux), no Android e no iPhone: **Ajustes → Instalar como app** mostra o caminho de cada
  navegador (ou instala com um toque onde o navegador oferece).
- Online: salas com convite por link, senha, ritmo calma/normal/ligeira, tempo por jogada, séries
  "melhor de X" e ranking por semana, mês e ano. Detalhes técnicos em [DEPLOY.md](DEPLOY.md).
- Privacidade: <https://fazquantas.pages.dev/privacidade>, com link nos créditos do jogo.
- Jogo assíncrono ("cada um no seu tempo": 1 h, 6 h, 12 h ou sem limite), apelido guardado com PIN,
  25 avatares da turma do Gaudério e o admin em <https://fazquantas.pages.dev/admin>.

### Como chamar a gurizada

1. Cada um abre o site uma vez e escolhe apelido e avatar.
2. Quem vai ser anfitrião toca **Jogar com a gurizada → Criar sala**, escolhe as regras, o ritmo, a
   série e se vale ranking, e toca **Convidar** (vai pelo WhatsApp).
3. Quem recebe o link cai direto na sala; com senha, digita a senha uma vez.
4. Para receber aviso da vez com o celular no bolso: **Ajustes → Avisar quando for tua vez**. No
   iPhone, só funciona com o jogo instalado na Tela de Início (limite do iOS).

### Validado em produção (28/09/2026)

- Três navegadores isolados (como abas anônimas): senha errada e certa, série melhor de 3 valendo
  ranking, recarregar a página no meio da partida, ranking no fim.
- Servidor, por WebSocket: sala cheia (8), bloqueio depois de 5 senhas erradas, expulsar, anfitrião
  saindo (a coroa passa), entrar em partida andando, queda e volta com a mão, tempo estourado virando
  ausente e o "voltei", sair no meio virando bot, sala hibernando no lobby e no meio da partida, outra
  aba assumindo o lugar, origem desconhecida recusada.
- Push de verdade no Chrome: a vez chega como notificação com a página escondida, com link para a sala.

## Próximos passos

### Domínio (opcional)

O endereço `fazquantas.pages.dev` é gratuito e definitivo. Um domínio próprio (ex.: `fazquantas.com.br`,
cerca de R$ 40 por ano no Registro.br) entra no Pages em **Custom domains**; depois, somar o domínio
em `ORIGENS` e `SITE` no `apps/worker/wrangler.jsonc`.

### Lojas (não são gratuitas)

| Loja | Custo | O que falta |
|---|---|---|
| Google Play | US$ 25, uma vez | Conta de desenvolvedor pessoal, teste fechado com 12 pessoas por 14 dias (regra para contas pessoais novas), ícones e capturas |
| App Store | US$ 99 por ano | Apple Developer Program, Xcode, revisão da Apple |

O app nativo já fala com o servidor de produção e tem a política de privacidade que as lojas pedem. O
passo a passo de build está em [MOBILE.md](MOBILE.md). Push no app nativo ainda não existe (a vez
avisa pelo som e vibração com o app aberto).
