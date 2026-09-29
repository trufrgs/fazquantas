# Segurança

## Como relatar uma vulnerabilidade

**Não abra issue pública.** Use o reporte privado do GitHub: aba
[**Security → Report a vulnerability**](https://github.com/trufrgs/fazquantas/security/advisories/new).
Só o mantenedor vê. Conta o que achou, como reproduzir e o impacto que tu imagina.

A resposta vem em até 7 dias. Quando a correção sair, a vulnerabilidade é publicada no mesmo lugar,
com crédito para quem relatou (se quiser).

## O que é de interesse

- O servidor do jogo online (`apps/worker`, `packages/sala`): ver a mão de outro jogador, jogar pelo
  outro, tomar o lugar de alguém, entrar em sala com senha sem ela, derrubar salas dos outros.
- As contas: apelido guardado com PIN (`ContasDO`), bloqueios.
- O admin (`/admin`) e os segredos do servidor.
- Dados pessoais guardados (ver a [política de privacidade](https://fazquantas.pages.dev/privacidade)).

Fora do escopo: ataques de volume (negação de serviço) contra a produção e engenharia social.
