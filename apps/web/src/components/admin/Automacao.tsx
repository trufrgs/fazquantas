import { useState } from 'react';
import { deviceSubscription, notifyState } from '../../lib/avisos';
import { Button } from '../ui/Button';
import { Stepper, Toggle } from '../ui/Controls';
import { Panel } from '../ui/ScreenFrame';
import { AUTOMACAO_PADRAO, hora, plural, resumoRodada, soHora, type Automacao as Regras, type Dados, type RodadaAutomacao, type RodarAcao } from './tipos';

/** Opções de cada regra (o Stepper anda por elas; 0 desliga). */
const HORAS = [0, 1, 2, 3, 6, 12, 24, 48, 72];
const LIMITES = [0, 5, 10, 20, 30, 50, 100, 200];

/** Índice da opção mais perto do valor salvo (o valor pode ter vindo de fora da lista). */
function perto(opcoes: number[], valor: number): number {
  return opcoes.reduce((melhor, v, i) => (Math.abs(v - valor) < Math.abs((opcoes[melhor] ?? 0) - valor) ? i : melhor), 0);
}

function Regra({
  titulo,
  explica,
  valor,
  opcoes,
  formato,
  onChange,
}: {
  titulo: string;
  explica: string;
  valor: number;
  opcoes: number[];
  formato: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <span className="min-w-0 flex-1 basis-56">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-sm text-tinta-2">{explica}</span>
      </span>
      <Stepper
        label={titulo}
        value={perto(opcoes, valor)}
        min={0}
        max={opcoes.length - 1}
        onChange={(i) => onChange(opcoes[i] ?? 0)}
        format={(i) => <span className="text-lg">{formato(opcoes[i] ?? 0)}</span>}
      />
    </div>
  );
}

const horas = (v: number) => (v === 0 ? 'nunca' : `${v} h`);

type EstadoAvisos = 'pronto' | 'pedindo' | 'negado' | 'sem-suporte';

/** O que o servidor faz sozinho, a manutenção e o resumo do dia no aparelho do admin. */
export function Automacao({ dados, token, acao }: { dados: Dados; token: string; acao: RodarAcao }) {
  const p = dados.painel;
  const salvas = p.automacao ?? dados.padrao ?? AUTOMACAO_PADRAO;
  const [mudancas, setMudancas] = useState<Partial<Regras>>({});
  const regras = { ...salvas, ...mudancas };
  const mudou = (Object.keys(mudancas) as (keyof Regras)[]).some((k) => mudancas[k] !== salvas[k]);
  const muda = (patch: Partial<Regras>) => setMudancas((m) => ({ ...m, ...patch }));

  const manut = p.manutencao ?? { ativa: false, mensagem: '', desde: null };
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [avisarMesas, setAvisarMesas] = useState(true);
  const textoManut = mensagem ?? manut.mensagem;

  const [avisos, setAvisos] = useState<EstadoAvisos>(() => (notifyState() === 'unsupported' ? 'sem-suporte' : notifyState() === 'denied' ? 'negado' : 'pronto'));
  const ultima = p.ultimaAutomacao ?? null;

  const assinar = async () => {
    setAvisos('pedindo');
    try {
      let permissao = Notification.permission;
      if (permissao === 'default') permissao = await Notification.requestPermission();
      if (permissao !== 'granted') return setAvisos('negado');
      const sub = await deviceSubscription();
      if (!sub) return setAvisos('sem-suporte');
      setAvisos('pronto');
      await acao('/api/admin/avisos/assinar', { subscription: sub.toJSON() }, (r) => `Este aparelho recebe o resumo do dia (${plural(Number(r.aparelhos ?? 1), 'aparelho', 'aparelhos')} no total).`);
    } catch {
      setAvisos('sem-suporte');
    }
  };

  const cancelar = async () => {
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    const sub = await reg?.pushManager?.getSubscription().catch(() => null);
    if (!sub) return void acao('/api/admin/avisos/cancelar', { subscription: { endpoint: 'https://nenhum' } }, 'Este aparelho não recebia o resumo.');
    // Só tira do admin: a mesma assinatura pode estar avisando a vez do jogador.
    await acao('/api/admin/avisos/cancelar', { subscription: { endpoint: sub.endpoint } }, 'Este aparelho não recebe mais o resumo.');
  };

  return (
    <>
      <Panel title="Regras automáticas">
        <p className="text-sm text-tinta-2">Rodam a cada 15 min no servidor. Mesa com gente jogando nunca é encerrada por elas.</p>
        <div className="flex flex-col divide-y divide-tinta/10">
          <Regra
            titulo="Lobby parado"
            explica="Encerra a sala que ninguém mexe no lobby há esse tempo."
            valor={regras.lobbyParadoHoras}
            opcoes={HORAS}
            formato={horas}
            onChange={(v) => muda({ lobbyParadoHoras: v })}
          />
          <Regra
            titulo="Partida terminada parada"
            explica="Encerra a sala em que a partida acabou e ninguém puxou outra."
            valor={regras.fimParadoHoras}
            opcoes={HORAS}
            formato={horas}
            onChange={(v) => muda({ fimParadoHoras: v })}
          />
          <Regra
            titulo="Salas por hora, por endereço"
            explica="Acima disso, o mesmo endereço de internet espera para criar outra (protege o plano gratuito)."
            valor={regras.limiteSalasPorHora}
            opcoes={LIMITES}
            formato={(v) => (v === 0 ? 'livre' : String(v))}
            onChange={(v) => muda({ limiteSalasPorHora: v })}
          />
          <Toggle
            label="Resumo do dia às 21:00 (BRT)"
            description="Push com pessoas, salas e partidas do dia, nos aparelhos do admin."
            checked={regras.resumoDiario}
            onChange={(v) => muda({ resumoDiario: v })}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ouro"
            disabled={!mudou}
            onClick={async () => {
              const r = await acao('/api/admin/automacao', mudancas, 'Regras salvas.');
              if (r?.ok) setMudancas({});
            }}
          >
            Salvar
          </Button>
          <Button size="sm" onClick={() => setMudancas({ ...(dados.padrao ?? AUTOMACAO_PADRAO) })}>
            Voltar ao padrão
          </Button>
        </div>
        <p className="mt-3 text-sm text-tinta-2">
          Fixas: sala ao vivo sem ninguém conectado acaba sozinha em 15 min (se escapar, a automação encerra depois de 1 h); sala de &quot;cada um no seu
          tempo&quot; parada acaba em 7 dias (a automação garante em 8); sala que sumiu sem avisar sai da lista na próxima rodada.
        </p>
      </Panel>

      <Panel title="Última rodada">
        {ultima ? (
          <>
            <p>
              {hora(ultima.quando)} BRT: {resumoRodada(ultima)}.
            </p>
            {ultima.encerradas.length > 0 && (
              <ul className="mt-1 text-sm text-tinta-2">
                {ultima.encerradas.map((e) => (
                  <li key={e.code}>
                    <strong className="tracking-[0.15em] text-tinta">{e.code}</strong>: {e.motivo}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-tinta-2">Ainda não rodou.</p>
        )}
        <Button
          size="sm"
          className="mt-2"
          onClick={() => void acao('/api/admin/automacao/rodar', {}, (r) => `Automação rodou: ${resumoRodada(r.rodada as RodadaAutomacao)}.`)}
        >
          Rodar agora
        </Button>
      </Panel>

      <Panel title="Manutenção">
        <p className="text-sm text-tinta-2">
          Barra salas novas; quem já está jogando segue na mesa (e volta sozinho se o servidor reiniciar). Liga antes de mexer em algo arriscado.
        </p>
        {manut.ativa && (
          <p className="mt-2 rounded-2xl bg-copas/12 px-3 py-2 font-semibold ring-1 ring-copas/40">
            Ligada{manut.desde ? ` desde ${soHora(manut.desde)} BRT` : ''}. Quem tenta criar sala vê: “{manut.mensagem || 'O jogo está em manutenção. Volta daqui a pouco.'}”
          </p>
        )}
        <input
          value={textoManut}
          onChange={(e) => setMensagem(e.target.value.slice(0, 200))}
          placeholder="Mensagem (ex.: Volto às 22h, tchê!)"
          aria-label="Mensagem da manutenção"
          className="mt-2 h-11 w-full rounded-2xl border-0 bg-white/70 px-4 text-tinta shadow-inner ring-1 ring-tinta/15 outline-none focus:ring-2 focus:ring-espadas"
        />
        {!manut.ativa && (
          <label className="mt-2 flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--color-espadas)]" checked={avisarMesas} onChange={(e) => setAvisarMesas(e.target.checked)} />
            Mandar a mensagem para as {plural(p.salasAbertas.length, 'mesa aberta', 'mesas abertas')} também
          </label>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {manut.ativa ? (
            <>
              <Button size="sm" variant="ouro" onClick={() => void acao('/api/admin/manutencao', { ativa: false }, 'Manutenção desligada: dá para criar sala de novo.').then(() => setMensagem(null))}>
                Desligar manutenção
              </Button>
              {mensagem !== null && mensagem !== manut.mensagem && (
                <Button size="sm" onClick={() => void acao('/api/admin/manutencao', { ativa: true, mensagem: textoManut }, 'Mensagem trocada.').then(() => setMensagem(null))}>
                  Trocar a mensagem
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              variant="copas"
              onClick={() =>
                void acao('/api/admin/manutencao', { ativa: true, mensagem: textoManut, avisar: avisarMesas }, (r) =>
                  avisarMesas && Number(r.pessoas ?? 0) > 0
                    ? `Manutenção ligada. Recado entregue a ${plural(Number(r.pessoas), 'pessoa', 'pessoas')}.`
                    : 'Manutenção ligada: ninguém cria sala nova.',
                ).then(() => setMensagem(null))
              }
            >
              Ligar manutenção
            </Button>
          )}
        </div>
      </Panel>

      <Panel title="Resumo no teu aparelho">
        <p className="text-sm text-tinta-2">
          {p.avisosAdmin ? `${plural(p.avisosAdmin, 'aparelho recebe', 'aparelhos recebem')} o resumo do dia.` : 'Nenhum aparelho recebe o resumo ainda.'} No
          iPhone, só com o jogo instalado na tela inicial.
        </p>
        {avisos === 'negado' && <p className="mt-2 font-semibold text-copas">As notificações estão bloqueadas neste navegador: libera nas configurações do site.</p>}
        {avisos === 'sem-suporte' && <p className="mt-2 font-semibold text-copas">Este navegador não recebe push (no iPhone, instala o jogo na tela inicial).</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="ouro" disabled={avisos === 'pedindo' || avisos === 'sem-suporte'} onClick={() => void assinar()}>
            Receber neste aparelho
          </Button>
          <Button
            size="sm"
            disabled={!p.avisosAdmin}
            onClick={() =>
              void acao('/api/admin/avisos/testar', {}, (r) =>
                Number(r.enviados ?? 0) > 0 ? `Resumo enviado para ${plural(Number(r.enviados), 'aparelho', 'aparelhos')}.` : 'Nenhum aparelho recebeu (confere a permissão).',
              )
            }
          >
            Mandar um agora
          </Button>
          <Button size="sm" variant="vidro" disabled={!p.avisosAdmin || !token} onClick={() => void cancelar()}>
            Parar neste aparelho
          </Button>
        </div>
      </Panel>
    </>
  );
}
