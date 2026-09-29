import { motivoParaEncerrar, paraConferir, type EstadoSala } from './automacao-regras';
import { painelStub, type RodadaAutomacao } from './painel-do';
import { sendPush, type VapidKeys } from './push';

/**
 * O que o admin não precisa fazer à mão, rodando no cron do Worker (a cada 15 min):
 *
 * - **Conferência:** sala que o painel acha aberta, parada há mais de 20 min, é perguntada ao próprio
 *   objeto; se ela não existe mais (morreu sem avisar), o painel fecha a linha.
 * - **Mesa parada:** lobby sem ninguém mexer há X horas e partida terminada sem ninguém puxar a
 *   próxima há Y horas são encerradas, com o motivo no histórico (X e Y o admin ajusta; 0 desliga).
 *   Salas ao vivo sem ninguém conectado já acabam sozinhas em 12 h, e as assíncronas em 7 dias.
 * - **Resumo do dia** (cron das 21:00 BRT): push para os aparelhos do admin.
 */

export async function rodarAutomacao(env: Env, now = Date.now()): Promise<RodadaAutomacao> {
  const painel = painelStub(env);
  const cfg = await painel.automacao();
  const rodada: RodadaAutomacao = { quando: now, verificadas: 0, sumidas: [], encerradas: [] };
  for (const s of paraConferir(await painel.abertas(), now)) {
    rodada.verificadas += 1;
    const stub = env.SALAS.get(env.SALAS.idFromName(s.code));
    let estado: EstadoSala;
    try {
      estado = await stub.estadoAdmin();
    } catch (error) {
      console.error('[automação] estado', s.code, error);
      continue;
    }
    if (!estado.existe) {
      await painel.salaEncerrada(s.code, 'sumiu (conferência automática)');
      rodada.sumidas.push(s.code);
      continue;
    }
    const motivo = motivoParaEncerrar(estado, cfg, now, s.criada);
    if (motivo && (await stub.encerrarPeloAdmin(motivo))) {
      rodada.encerradas.push({ code: s.code, motivo });
      await painel.registrar('automação: encerrou a mesa', s.code, motivo);
    }
  }
  if (rodada.sumidas.length) await painel.registrar('automação: conferiu salas sumidas', rodada.sumidas.join(', '), `${rodada.sumidas.length} fechadas no painel`);
  await painel.salvarRodada(rodada);
  return rodada;
}

function vapid(env: Env): VapidKeys | null {
  const privateKey = (env as unknown as { VAPID_PRIVADO?: string }).VAPID_PRIVADO;
  if (!privateKey || !env.VAPID_PUBLICO) return null;
  return { publicKey: env.VAPID_PUBLICO, privateKey, subject: env.VAPID_CONTATO };
}

/** Resumo do dia para os aparelhos do admin (push). Devolve quantos aparelhos receberam. */
export async function enviarResumo(env: Env, forcar = false): Promise<number> {
  const painel = painelStub(env);
  const cfg = await painel.automacao();
  const keys = vapid(env);
  if ((!cfg.resumoDiario && !forcar) || !keys) return 0;
  const subs = await painel.assinaturasAdmin();
  if (subs.length === 0) return 0;
  const d = await painel.dados();
  const hoje = d.dias.at(-1);
  const body =
    `Hoje: ${hoje?.pessoas ?? 0} pessoas, ${hoje?.salas ?? 0} salas, ${hoje?.partidas ?? 0} partidas` +
    ` (${hoje?.ranqueadas ?? 0} valendo). Abertas agora: ${d.salasAbertas.length}.` +
    (d.ultimaAutomacao?.encerradas.length ? ` A automação encerrou ${d.ultimaAutomacao.encerradas.length} mesa(s) parada(s).` : '');
  let enviados = 0;
  for (const sub of subs) {
    const status = await sendPush(sub, { title: 'Faz quantas? · resumo do dia', body, tag: 'resumo-admin', url: `${env.SITE}/admin` }, keys).catch(() => 0);
    if (status >= 200 && status < 300) enviados += 1;
    else if (status === 404 || status === 410) await painel.cancelarAdmin(sub.endpoint);
  }
  return enviados;
}
