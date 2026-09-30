import type { IceServer, VozNaSala } from '@fodinha/engine';
import type Peer from '@thaunknown/simple-peer';
import { create } from 'zustand';

/**
 * A conversa por voz da sala (pedido do Thomas em 30/09/2026): quem entra abre o microfone e ouve os
 * outros que entraram. O áudio vai direto entre os aparelhos (WebRTC, em malha: cada um liga com cada
 * um, até 8), com o `@thaunknown/simple-peer`; o servidor da sala só diz quem está na conversa e repassa
 * a oferta e a resposta de cada ligação. Quando a rede não deixa ligar direto, o TURN do Cloudflare faz
 * a ponte (as credenciais vêm na entrada).
 *
 * Quem liga é sempre o de id menor (o outro espera a oferta): as duas pontas nunca oferecem ao mesmo
 * tempo. Sem "trickle": a oferta já vai com os caminhos possíveis, uma mensagem para cada lado.
 */

/** Como a conversa fala com a sala (o socket, no jogo; um de mentira, nos testes). */
export interface TransporteDaVoz {
  /** Avisa a sala que entrou; devolve os servidores ICE, ou `null` se a sala não deixou. */
  entrar(): Promise<IceServer[] | null>;
  sair(): void;
  mudo(mudo: boolean): void;
  sinal(para: string, dados: unknown): void;
}

export interface EstadoDaVoz {
  /** Tu está na conversa. */
  ligada: boolean;
  entrando: boolean;
  mudo: boolean;
  /** Quem está falando agora (tu também), pelo volume do áudio. */
  falando: Record<string, boolean>;
  erro: string | null;
}

export const useVoz = create<EstadoDaVoz>(() => ({ ligada: false, entrando: false, mudo: false, falando: {}, erro: null }));

/** Volume (0 a 1) acima do qual conta como falando, e por quanto tempo a fala "segura" depois. */
const LIMIAR = 0.035;
const SEGURA_MS = 350;
/** Ligação que caiu: espera um pouco antes de tentar de novo com a mesma pessoa. */
const ESPERA_RELIGAR_MS = 4000;

type Medidor = { analisador: AnalyserNode; fonte: MediaStreamAudioSourceNode; ate: number };

class Conversa {
  private eu: string | null = null;
  private transporte: TransporteDaVoz | null = null;
  private ice: IceServer[] = [];
  private microfone: MediaStream | null = null;
  private readonly pares = new Map<string, Peer>();
  private readonly audios = new Map<string, HTMLAudioElement>();
  private readonly medidores = new Map<string, Medidor>();
  private readonly caiuEm = new Map<string, number>();
  private vozes: VozNaSala[] = [];
  /** A biblioteca do WebRTC só carrega quando alguém entra na conversa (não pesa no resto do jogo). */
  private PeerClass: typeof Peer | null = null;
  private ctx: AudioContext | null = null;
  private laco: number | null = null;
  private reanunciando = false;
  /** Religar depois da espera (a sala pode não mudar mais para chamar `sincronizar` de novo). */
  private religar: number | null = null;

  /** Entra na conversa: pede o microfone (dentro do toque) e avisa a sala. */
  async entrar(eu: string, transporte: TransporteDaVoz): Promise<void> {
    if (useVoz.getState().ligada || useVoz.getState().entrando) return;
    useVoz.setState({ entrando: true, erro: null });
    try {
      this.microfone = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch {
      useVoz.setState({ entrando: false, erro: 'Sem o microfone: libera o acesso nas permissões do navegador.' });
      return;
    }
    try {
      this.PeerClass ??= (await import('@thaunknown/simple-peer')).default;
    } catch {
      this.pararMicrofone();
      useVoz.setState({ entrando: false, erro: 'Não deu para abrir a conversa neste aparelho.' });
      return;
    }
    const ice = await transporte.entrar().catch(() => null);
    if (!ice) {
      this.pararMicrofone();
      useVoz.setState({ entrando: false, erro: 'Não deu para entrar na conversa agora.' });
      return;
    }
    this.eu = eu;
    this.transporte = transporte;
    this.ice = ice;
    this.medir(eu, this.microfone);
    useVoz.setState({ ligada: true, entrando: false, mudo: false, erro: null });
    this.laco = window.setInterval(() => this.atualizarFala(), 120);
    this.sincronizar(this.vozes);
  }

  /** Sai da conversa: fecha as ligações e o microfone. */
  sair(avisar = true): void {
    if (avisar && useVoz.getState().ligada) this.transporte?.sair();
    for (const id of [...this.pares.keys()]) this.fechar(id);
    this.pararMicrofone();
    for (const m of this.medidores.values()) m.fonte.disconnect();
    this.medidores.clear();
    if (this.laco !== null) window.clearInterval(this.laco);
    this.laco = null;
    if (this.religar !== null) window.clearTimeout(this.religar);
    this.religar = null;
    this.transporte = null;
    this.eu = null;
    useVoz.setState({ ligada: false, entrando: false, mudo: false, falando: {} });
  }

  alternarMudo(): void {
    if (!useVoz.getState().ligada) return;
    const mudo = !useVoz.getState().mudo;
    for (const t of this.microfone?.getAudioTracks() ?? []) t.enabled = !mudo;
    this.transporte?.mudo(mudo);
    useVoz.setState({ mudo });
  }

  /** A sala mudou: liga com quem entrou, desliga de quem saiu. */
  sincronizar(vozes: readonly VozNaSala[]): void {
    this.vozes = [...vozes];
    const eu = this.eu;
    if (!eu || !useVoz.getState().ligada) return;
    const ids = new Set(this.vozes.map((v) => v.playerId));
    // A sala esqueceu que tu estava (a conexão caiu e voltou): avisa de novo, sem pedir o microfone.
    if (!ids.has(eu)) {
      this.reanunciar();
      return;
    }
    for (const id of [...this.pares.keys()]) if (!ids.has(id)) this.fechar(id);
    for (const id of ids) {
      if (id === eu || this.pares.has(id) || eu > id) continue; // quem liga é o de id menor; o outro espera a oferta
      const espera = ESPERA_RELIGAR_MS - (Date.now() - (this.caiuEm.get(id) ?? 0));
      if (espera <= 0) this.ligar(id, true);
      else this.agendarReligar(espera);
    }
  }

  private agendarReligar(ms: number): void {
    if (this.religar !== null) return;
    this.religar = window.setTimeout(() => {
      this.religar = null;
      this.sincronizar(this.vozes);
    }, ms + 50);
  }

  /** Chegou a oferta ou a resposta de alguém da conversa. */
  receberSinal(de: string, dados: unknown): void {
    if (!useVoz.getState().ligada || !this.vozes.some((v) => v.playerId === de)) return;
    const oferta = (dados as { type?: string } | null)?.type === 'offer';
    let par = this.pares.get(de);
    // Oferta nova de quem já tinha ligação: a outra ponta recomeçou; recomeça aqui também.
    if (par && oferta) {
      this.fechar(de);
      par = undefined;
    }
    par ??= oferta ? this.ligar(de, false) : undefined;
    try {
      par?.signal(dados);
    } catch {
      this.fechar(de);
    }
  }

  private ligar(id: string, inicia: boolean): Peer | undefined {
    const PeerClass = this.PeerClass;
    if (!PeerClass) return undefined;
    const par = new PeerClass({ initiator: inicia, stream: this.microfone ?? undefined, trickle: false, config: { iceServers: this.ice } });
    this.pares.set(id, par);
    par.on('signal', (dados) => this.transporte?.sinal(id, dados));
    par.on('stream', (stream) => this.tocar(id, stream));
    const caiu = () => {
      if (this.pares.get(id) !== par) return;
      this.caiuEm.set(id, Date.now());
      this.fechar(id);
    };
    par.on('close', caiu);
    par.on('error', caiu);
    return par;
  }

  private fechar(id: string): void {
    const par = this.pares.get(id);
    this.pares.delete(id);
    try {
      par?.destroy();
    } catch {
      // já estava fechada
    }
    const audio = this.audios.get(id);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    this.audios.delete(id);
    this.medidores.get(id)?.fonte.disconnect();
    this.medidores.delete(id);
  }

  private tocar(id: string, stream: MediaStream): void {
    let audio = this.audios.get(id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.hidden = true;
      document.body.appendChild(audio);
      this.audios.set(id, audio);
    }
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    this.medir(id, stream);
  }

  /** Mede o volume de quem fala (para acender o avatar). */
  private medir(id: string, stream: MediaStream): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
      this.medidores.get(id)?.fonte.disconnect();
      const fonte = this.ctx.createMediaStreamSource(stream);
      const analisador = this.ctx.createAnalyser();
      analisador.fftSize = 512;
      fonte.connect(analisador);
      this.medidores.set(id, { analisador, fonte, ate: 0 });
    } catch {
      // sem medidor: a voz funciona do mesmo jeito, só o avatar não acende
    }
  }

  private atualizarFala(): void {
    const agora = Date.now();
    const amostra = new Uint8Array(512);
    const falando: Record<string, boolean> = {};
    const mudo = useVoz.getState().mudo;
    for (const [id, m] of this.medidores) {
      m.analisador.getByteTimeDomainData(amostra);
      let soma = 0;
      for (const v of amostra) soma += ((v - 128) / 128) ** 2;
      const volume = Math.sqrt(soma / amostra.length);
      if (volume > LIMIAR && !(id === this.eu && mudo)) m.ate = agora + SEGURA_MS;
      if (m.ate > agora) falando[id] = true;
    }
    const antes = useVoz.getState().falando;
    const mudou = Object.keys(falando).length !== Object.keys(antes).length || Object.keys(falando).some((id) => !antes[id]);
    if (mudou) useVoz.setState({ falando });
  }

  private reanunciar(): void {
    if (this.reanunciando || !this.transporte) return;
    this.reanunciando = true;
    void this.transporte
      .entrar()
      .then((ice) => {
        if (ice) this.ice = ice;
        else this.sair(false);
      })
      .finally(() => {
        this.reanunciando = false;
      });
  }

  private pararMicrofone(): void {
    for (const t of this.microfone?.getTracks() ?? []) t.stop();
    this.microfone = null;
  }

  /** Para depurar e para os testes: o estado de cada ligação. */
  diagnostico(): { eu: string | null; pares: Record<string, { conectado: boolean }>; audios: number; falando: string[] } {
    return {
      eu: this.eu,
      pares: Object.fromEntries([...this.pares].map(([id, p]) => [id, { conectado: p.connected }])),
      audios: this.audios.size,
      falando: Object.keys(useVoz.getState().falando),
    };
  }
}

export const conversa = new Conversa();

if (typeof window !== 'undefined') (window as unknown as { __voz?: Conversa }).__voz = conversa;
