---
name: deploy-fodinha
description: Como publicar o servidor do Faz Quantas? (web + multiplayer) e o que muda para escalar
owner: "@trufrgs"
last_updated: 2026-09-28
status: active
---

# Deploy

Um processo Node só serve tudo: os arquivos do web (build do Vite) e o multiplayer (socket.io) na
mesma porta. As salas ficam na memória desse processo.

## Variáveis de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | `3001` | porta HTTP |
| `HOST` | `0.0.0.0` | interface de rede |
| `STATIC_DIR` | `apps/web/dist` (se existir) | pasta do build do web |
| `CORS_ORIGINS` | qualquer origem | lista separada por vírgula; as origens do app Capacitor entram sozinhas |
| `FODINHA_FAST` | desligado | `1` encurta as pausas (testes e demonstração) |

O web descobre o servidor sozinho quando está na mesma origem. Se o web ficar num domínio e o servidor
em outro, gere o build com `VITE_SERVER_URL=https://servidor.exemplo.com pnpm build`.

## Docker

```bash
docker build -t fodinha .
docker run -p 3001:3001 fodinha
```

A imagem (~180 MB) tem healthcheck em `/health`, roda como usuário `node` e não precisa de volume.

## Onde hospedar

O requisito é suportar WebSocket e manter **uma instância sempre ligada**: se a instância dorme ou
reinicia, as salas em andamento somem (quem estava jogando volta ao início).

- **Fly.io:** `fly launch` com o Dockerfile, `internal_port = 3001`, `auto_stop_machines = "off"` e
  `min_machines_running = 1`. WebSocket funciona sem configuração extra.
- **Render / Railway:** serviço web a partir do Dockerfile, health check em `/health`, plano sem
  hibernação.
- **Google Cloud Run:** `--min-instances=1 --max-instances=1 --session-affinity --timeout=3600`.
  O limite de 60 min por conexão não atrapalha: o cliente reconecta sozinho e volta ao mesmo assento.

Use HTTPS: instalar o PWA, compartilhar convite e copiar para a área de transferência exigem origem
segura.

## Limites e proteção

- Até 5.000 salas simultâneas; salas sem ninguém conectado somem depois de 5 minutos.
- Toda mensagem é validada (zod) e há limite de taxa por conexão (rajada de 20, 10 por segundo).
- Cada jogador recebe só a própria visão da mesa; o servidor nunca manda a mão de outro jogador.

## Para escalar depois

Uma instância aguenta muitas salas (o jogo é por turnos e os bots decidem em milissegundos). Quando
precisar de mais de uma instância, o estado das salas precisa ficar num lugar só por sala:

1. **Fatiar por código de sala:** um roteador na frente manda cada código sempre para a mesma
   instância (o código entra na URL do socket).
2. **Trocar o transporte:** o `GameHost` é independente de transporte, então dá para mover cada sala
   para um Durable Object (Cloudflare) ou para uma sala do Colyseus sem mexer nas regras.

O adaptador Redis do socket.io sozinho **não** resolve: ele distribui mensagens, não o estado da
partida.
