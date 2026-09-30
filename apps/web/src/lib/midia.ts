import type { IceServer, RoomState } from '@fodinha/engine';
import type Peer from '@thaunknown/simple-peer';
import { create } from 'zustand';

/**
 * Microfone e câmera da mesa online (voz em 30/09/2026; vídeo no mesmo dia, pedidos do Thomas): cada um
 * escolhe o que abre (nada, só o microfone, só a câmera ou os dois), e a sala toda ouve e vê o que foi
 * aberto. O áudio e o vídeo vão direto entre os aparelhos (WebRTC em malha, até 8), com o
 * `@thaunknown/simple-peer`, carregado só quando alguém abre alguma coisa; o servidor da sala só diz o
 * que cada um abriu e repassa o sinal de cada ligação. Sem rede para ligar direto, o TURN do Cloudflare
 * faz a ponte (as credenciais vêm de `midia:ice`).
 *
 * Duas pessoas se ligam quando pelo menos uma delas abriu alguma coisa; quem liga é a de id menor (a
 * outra espera a oferta). Sem "trickle": oferta e resposta vão com os caminhos possíveis. Abrir ou fechar
 * a câmera renegocia a ligação (a biblioteca cuida disso); o microfone silencia na hora e, depois de um
 * tempo fechado, solta o aparelho. Cada ligação tem uma sessão: se a outra ponta recomeçou, a oferta
 * nova (de outra sessão) recomeça a ligação aqui também.
 */

export interface TransporteDaMidia {
  /** Os servidores ICE, ou `null` se a sala não respondeu. */
  ice(): Promise<IceServer[] | null>;
  estado(mic: boolean, camera: boolean): void;
  sinal(para: string, dados: unknown): void;
}

export interface EstadoDaMidia {
  mic: boolean;
  camera: boolean;
  /** Esperando a permissão do navegador. */
  pedindo: 'mic' | 'camera' | null;
  erro: string | null;
  /** Quem está falando agora (tu também), pelo volume. */
  falando: Record<string, boolean>;
  /** A tua câmera, para a prévia no teu assento. */
  local: MediaStream | null;
  /** O que chega de cada um (o rosto aparece no assento). */
  remotos: Record<string, MediaStream>;
  /** Muda quando uma trilha chega: o vídeo na tela religa. */
  versao: number;
  /** O rosto que alguém tocou para ver grande. */
  ampliado: string | null;
}

export const useMidia = create<EstadoDaMidia>(() => ({
  mic: false,
  camera: false,
  pedindo: null,
  erro: null,
  falando: {},
  local: null,
  remotos: {},
  versao: 0,
  ampliado: null,
}));

/** Volume (0 a 1) que conta como fala, e quanto a fala "segura" depois. */
const LIMIAR = 0.035;
const SEGURA_MS = 350;
/** Ligação que caiu: espera antes de tentar de novo com a mesma pessoa. */
const ESPERA_RELIGAR_MS = 4000;
/**
 * Ligação que não fechou nesse tempo (a oferta ou a resposta se perdeu, por exemplo com a conexão da
 * sala caindo no meio): desiste e tenta de novo, com outra sessão.
 */
const PRAZO_LIGAR_MS = 12_000;
/** Depois de a sala voltar, ligação ainda aberta sem ter fechado há esse tempo recomeça logo. */
const VELHA_MS = 6000;
/** Microfone fechado por esse tempo solta o aparelho (some o aviso de microfone em uso). */
const SOLTA_MIC_MS = 10_000;
/** Vídeo pequeno (é para caber no círculo do assento) e leve para o 4G. */
const VIDEO: MediaTrackConstraints = { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 }, frameRate: { ideal: 15, max: 20 } };
/** Com muita gente vendo (cada ligação codifica o vídeo de novo), a câmera fica menor e mais lenta. */
const VIDEO_MESA_CHEIA: MediaTrackConstraints = { width: { ideal: 240 }, height: { ideal: 240 }, frameRate: { ideal: 12, max: 15 } };
const MESA_CHEIA = 5;
const VIDEO_KBPS = 200;

type Medidor = { analisador: AnalyserNode; fonte: MediaStreamAudioSourceNode; ate: number };
type Par = { peer: Peer; sessao: string; inicia: boolean; desde: number; vigia: number | null };

/** Limita a banda do vídeo na oferta e na resposta (a linha `b=` logo depois do `c=` da seção de vídeo). */
export function limitarVideo(sdp: string): string {
  const saida: string[] = [];
  let noVideo = false;
  for (const linha of sdp.split('\r\n')) {
    if (linha.startsWith('m=')) noVideo = linha.startsWith('m=video');
    if (noVideo && linha.startsWith('b=')) continue;
    saida.push(linha);
    if (noVideo && linha.startsWith('c=')) saida.push(`b=AS:${VIDEO_KBPS}`);
  }
  return saida.join('\r\n');
}

const sessaoNova = () => Math.random().toString(36).slice(2, 10);

class MidiaDaMesa {
  private eu: string | null = null;
  private transporte: TransporteDaMidia | null = null;
  private ice: IceServer[] | null = null;
  private pedindoIce: Promise<IceServer[] | null> | null = null;
  private PeerClass: typeof Peer | null = null;
  private carregando: Promise<typeof Peer | null> | null = null;
  /** O que tu manda: as trilhas do microfone e da câmera entram e saem deste stream (criado no uso). */
  private meuStream: MediaStream | null = null;
  private get meu(): MediaStream {
    return (this.meuStream ??= new MediaStream());
  }
  private trilhaMic: MediaStreamTrack | null = null;
  private trilhaCamera: MediaStreamTrack | null = null;
  private soltaMic: number | null = null;
  private readonly pares = new Map<string, Par>();
  private readonly audios = new Map<string, HTMLAudioElement>();
  private readonly medidores = new Map<string, Medidor>();
  private readonly caiuEm = new Map<string, number>();
  /** Os outros humanos conectados na sala, e o que cada um abriu. */
  private outros: string[] = [];
  private abertos = new Map<string, { mic: boolean; camera: boolean }>();
  private ouvir = true;
  private ctx: AudioContext | null = null;
  private laco: number | null = null;
  private religar: number | null = null;
  private filas = new Map<string, Promise<void>>();
  private anunciadoEm = 0;

  usar(transporte: TransporteDaMidia): void {
    this.transporte = transporte;
  }

  /** A sala mudou: liga com quem precisa, desliga de quem não precisa mais. */
  sincronizar(room: RoomState): void {
    this.eu = room.youId;
    this.outros = room.seats.filter((s) => s.kind === 'human' && s.playerId !== room.youId && s.connected).map((s) => s.playerId);
    this.abertos = new Map((room.midias ?? []).map((m) => [m.playerId, { mic: m.mic, camera: m.camera }]));
    const { mic, camera } = useMidia.getState();
    // A sala esqueceu o que tu abriu (a conexão caiu e voltou): avisa de novo.
    const la = this.abertos.get(room.youId);
    if ((mic || camera) && (la?.mic !== mic || la?.camera !== camera) && Date.now() - this.anunciadoEm > 1500) this.anunciar();
    for (const [id, par] of [...this.pares]) {
      // Não precisa mais; ou ficou pendurada sem fechar (sinal perdido na queda da sala): recomeça.
      if (!this.precisa(id) || (!par.peer.connected && Date.now() - par.desde > VELHA_MS)) this.fechar(id);
    }
    if (this.abertos.size > 0 || mic || camera) void this.preparar().then(() => this.ligarQuemFalta());
  }

  /** Tu ou a outra pessoa abriu alguma coisa: vocês dois se ligam. */
  private precisa(id: string): boolean {
    if (!this.outros.includes(id)) return false;
    const { mic, camera } = useMidia.getState();
    return mic || camera || this.abertos.has(id);
  }

  private ligarQuemFalta(): void {
    this.ajustarCamera();
    const eu = this.eu;
    if (!eu || !this.PeerClass || !this.ice) return;
    for (const id of this.outros) {
      if (this.pares.has(id) || eu > id || !this.precisa(id)) continue; // quem liga é o de id menor
      const espera = ESPERA_RELIGAR_MS - (Date.now() - (this.caiuEm.get(id) ?? 0));
      if (espera <= 0) this.ligar(id, true, sessaoNova());
      else this.agendarReligar(espera);
    }
  }

  private cameraCheia = false;

  /** A câmera acompanha quantos estão vendo: com a mesa cheia, menor e mais lenta (poupa o celular). */
  private ajustarCamera(): void {
    const cheia = this.pares.size >= MESA_CHEIA;
    if (!this.trilhaCamera || cheia === this.cameraCheia) return;
    this.cameraCheia = cheia;
    void this.trilhaCamera.applyConstraints(cheia ? VIDEO_MESA_CHEIA : VIDEO).catch(() => undefined);
  }

  private agendarReligar(ms: number): void {
    if (this.religar !== null) return;
    this.religar = window.setTimeout(() => {
      this.religar = null;
      this.ligarQuemFalta();
    }, ms + 50);
  }

  /** A biblioteca e os servidores ICE, na primeira vez que alguém abre alguma coisa. */
  private async preparar(): Promise<boolean> {
    this.carregando ??= import('@thaunknown/simple-peer').then((m) => m.default).catch(() => null);
    this.PeerClass ??= await this.carregando;
    if (!this.ice && this.transporte) {
      this.pedindoIce ??= this.transporte.ice().catch(() => null);
      this.ice = await this.pedindoIce;
      if (!this.ice) this.pedindoIce = null; // tenta de novo na próxima
    }
    return !!this.PeerClass && !!this.ice;
  }

  // ---------------------------------------------------------------------------
  // Tu: microfone e câmera

  async alternarMic(): Promise<void> {
    const estado = useMidia.getState();
    if (estado.pedindo) return;
    if (estado.mic) {
      if (this.trilhaMic) this.trilhaMic.enabled = false;
      useMidia.setState({ mic: false });
      this.agendarSoltarMic();
    } else {
      if (this.soltaMic !== null) window.clearTimeout(this.soltaMic);
      this.soltaMic = null;
      if (this.trilhaMic && this.trilhaMic.readyState === 'live') this.trilhaMic.enabled = true;
      else {
        const trilha = await this.pedir('mic');
        if (!trilha) return;
        this.trilhaMic = trilha;
        this.adicionar(trilha);
        this.medir(this.eu ?? 'eu', new MediaStream([trilha]));
      }
      useMidia.setState({ mic: true });
    }
    this.depoisDeMudar();
  }

  async alternarCamera(): Promise<void> {
    const estado = useMidia.getState();
    if (estado.pedindo) return;
    if (estado.camera) {
      const trilha = this.trilhaCamera;
      this.trilhaCamera = null;
      if (trilha) {
        this.remover(trilha);
        trilha.stop(); // a luz da câmera apaga
      }
      useMidia.setState({ camera: false, local: null });
    } else {
      const trilha = await this.pedir('camera');
      if (!trilha) return;
      this.trilhaCamera = trilha;
      this.cameraCheia = false;
      this.adicionar(trilha);
      useMidia.setState({ camera: true, local: new MediaStream([trilha]) });
    }
    this.depoisDeMudar();
  }

  /** Pede o microfone ou a câmera (dentro do toque: o navegador pergunta na primeira vez). */
  private async pedir(tipo: 'mic' | 'camera'): Promise<MediaStreamTrack | null> {
    useMidia.setState({ pedindo: tipo, erro: null });
    try {
      const s = await navigator.mediaDevices.getUserMedia(
        tipo === 'mic' ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false } : { audio: false, video: VIDEO },
      );
      useMidia.setState({ pedindo: null });
      return (tipo === 'mic' ? s.getAudioTracks() : s.getVideoTracks())[0] ?? null;
    } catch {
      useMidia.setState({
        pedindo: null,
        erro: tipo === 'mic' ? 'Sem o microfone: libera o acesso nas permissões do navegador.' : 'Sem a câmera: libera o acesso nas permissões do navegador.',
      });
      return null;
    }
  }

  private adicionar(trilha: MediaStreamTrack): void {
    this.meu.addTrack(trilha);
    for (const [id, par] of this.pares) {
      try {
        par.peer.addTrack(trilha, this.meu);
      } catch {
        this.fechar(id);
      }
    }
  }

  private remover(trilha: MediaStreamTrack): void {
    for (const [id, par] of this.pares) {
      try {
        par.peer.removeTrack(trilha, this.meu);
      } catch {
        this.fechar(id);
      }
    }
    this.meu.removeTrack(trilha);
  }

  private agendarSoltarMic(): void {
    if (this.soltaMic !== null) window.clearTimeout(this.soltaMic);
    this.soltaMic = window.setTimeout(() => {
      this.soltaMic = null;
      const trilha = this.trilhaMic;
      if (!trilha || useMidia.getState().mic) return;
      this.trilhaMic = null;
      this.remover(trilha);
      trilha.stop();
      if (this.eu) this.pararMedidor(this.eu);
    }, SOLTA_MIC_MS);
  }

  private depoisDeMudar(): void {
    this.anunciar();
    const { mic, camera } = useMidia.getState();
    if (mic || camera) void this.preparar().then(() => this.ligarQuemFalta());
    else for (const id of [...this.pares.keys()]) if (!this.precisa(id)) this.fechar(id);
  }

  private anunciar(): void {
    const { mic, camera } = useMidia.getState();
    this.anunciadoEm = Date.now();
    this.transporte?.estado(mic, camera);
  }

  // ---------------------------------------------------------------------------
  // As ligações

  /** Chegou um sinal de alguém da sala (na ordem em que chegou, por pessoa). */
  receberSinal(de: string, bruto: unknown): void {
    const anterior = this.filas.get(de) ?? Promise.resolve();
    const proxima = anterior.then(() => this.tratarSinal(de, bruto)).catch(() => undefined);
    this.filas.set(de, proxima);
  }

  private async tratarSinal(de: string, bruto: unknown): Promise<void> {
    const { s: sessao, d: dados } = (bruto ?? {}) as { s?: string; d?: unknown };
    if (!sessao || !this.outros.includes(de)) return;
    const oferta = (dados as { type?: string } | null)?.type === 'offer';
    let par = this.pares.get(de);
    if (par && par.sessao !== sessao) {
      // A outra ponta recomeçou (oferta de outra sessão): recomeça aqui também; sinal velho, ignora.
      if (!oferta || par.inicia) return;
      this.fechar(de);
      par = undefined;
    }
    if (!par) {
      if (!oferta || !(await this.preparar())) return;
      par = this.ligar(de, false, sessao);
    }
    try {
      par?.peer.signal(dados);
    } catch {
      this.fechar(de);
    }
  }

  private ligar(id: string, inicia: boolean, sessao: string): Par | undefined {
    const PeerClass = this.PeerClass;
    if (!PeerClass || !this.ice) return undefined;
    const peer = new PeerClass({
      initiator: inicia,
      stream: this.meu,
      trickle: false,
      config: { iceServers: this.ice },
      // Quem liga já pede para receber áudio e vídeo: a outra ponta manda o que tiver aberto na resposta.
      offerOptions: { offerToReceiveAudio: true, offerToReceiveVideo: true },
      sdpTransform: limitarVideo,
    });
    const par: Par = { peer, sessao, inicia, desde: Date.now(), vigia: null };
    this.pares.set(id, par);
    peer.on('signal', (dados) => this.transporte?.sinal(id, { s: sessao, d: dados }));
    peer.on('track', (trilha, stream) => this.chegou(id, trilha, stream));
    const caiu = () => {
      if (this.pares.get(id) !== par) return;
      this.caiuEm.set(id, Date.now());
      this.fechar(id);
      this.agendarReligar(ESPERA_RELIGAR_MS);
    };
    peer.on('close', caiu);
    peer.on('error', caiu);
    par.vigia = window.setTimeout(() => {
      par.vigia = null;
      if (!peer.connected) caiu();
    }, PRAZO_LIGAR_MS);
    peer.on('connect', () => {
      if (par.vigia !== null) window.clearTimeout(par.vigia);
      par.vigia = null;
    });
    return par;
  }

  private chegou(id: string, trilha: MediaStreamTrack, stream: MediaStream): void {
    const estado = useMidia.getState();
    useMidia.setState({ remotos: { ...estado.remotos, [id]: stream }, versao: estado.versao + 1 });
    if (trilha.kind !== 'audio') return;
    let audio = this.audios.get(id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.hidden = true;
      document.body.appendChild(audio);
      this.audios.set(id, audio);
    }
    audio.muted = !this.ouvir;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    this.medir(id, stream);
  }

  private fechar(id: string): void {
    const par = this.pares.get(id);
    this.pares.delete(id);
    if (par?.vigia != null) window.clearTimeout(par.vigia);
    try {
      par?.peer.destroy();
    } catch {
      // já estava fechada
    }
    const audio = this.audios.get(id);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    this.audios.delete(id);
    this.pararMedidor(id);
    const estado = useMidia.getState();
    if (estado.remotos[id]) {
      const { [id]: _saiu, ...resto } = estado.remotos;
      useMidia.setState({ remotos: resto, versao: estado.versao + 1, ampliado: estado.ampliado === id ? null : estado.ampliado });
    }
  }

  // ---------------------------------------------------------------------------
  // Ouvir, acordar e medir

  /** Ouvir ou não a conversa dos outros (ajuste "Ouvir a conversa"). */
  setOuvir(on: boolean): void {
    this.ouvir = on;
    for (const a of this.audios.values()) a.muted = !on;
  }

  /** Um toque na tela: o iPhone só deixa tocar o áudio que chegou depois de um toque. */
  acordar(): void {
    for (const a of this.audios.values()) if (a.paused) void a.play().catch(() => undefined);
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  private medir(id: string, stream: MediaStream): void {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
      this.pararMedidor(id);
      const fonte = this.ctx.createMediaStreamSource(stream);
      const analisador = this.ctx.createAnalyser();
      analisador.fftSize = 512;
      fonte.connect(analisador);
      this.medidores.set(id, { analisador, fonte, ate: 0 });
      this.laco ??= window.setInterval(() => this.atualizarFala(), 120);
    } catch {
      // sem medidor: a voz funciona igual, só o avatar não acende
    }
  }

  private pararMedidor(id: string): void {
    this.medidores.get(id)?.fonte.disconnect();
    this.medidores.delete(id);
  }

  private atualizarFala(): void {
    const agora = Date.now();
    const amostra = new Uint8Array(512);
    const falando: Record<string, boolean> = {};
    const { mic } = useMidia.getState();
    for (const [id, m] of this.medidores) {
      m.analisador.getByteTimeDomainData(amostra);
      let soma = 0;
      for (const v of amostra) soma += ((v - 128) / 128) ** 2;
      const volume = Math.sqrt(soma / amostra.length);
      const aberto = id === this.eu ? mic : this.abertos.get(id)?.mic;
      if (volume > LIMIAR && aberto) m.ate = agora + SEGURA_MS;
      if (m.ate > agora) falando[id] = true;
    }
    const antes = useMidia.getState().falando;
    const mudou = Object.keys(falando).length !== Object.keys(antes).length || Object.keys(falando).some((id) => !antes[id]);
    if (mudou) useMidia.setState({ falando });
  }

  /** Saiu da sala: fecha tudo e solta o microfone e a câmera. */
  sairDaSala(): void {
    for (const id of [...this.pares.keys()]) this.fechar(id);
    for (const t of this.meuStream?.getTracks() ?? []) {
      t.stop();
      this.meuStream?.removeTrack(t);
    }
    this.trilhaMic = null;
    this.trilhaCamera = null;
    if (this.soltaMic !== null) window.clearTimeout(this.soltaMic);
    this.soltaMic = null;
    for (const id of [...this.medidores.keys()]) this.pararMedidor(id);
    if (this.laco !== null) window.clearInterval(this.laco);
    this.laco = null;
    if (this.religar !== null) window.clearTimeout(this.religar);
    this.religar = null;
    this.ice = null;
    this.pedindoIce = null;
    this.outros = [];
    this.abertos = new Map();
    this.filas = new Map();
    this.eu = null;
    useMidia.setState({ mic: false, camera: false, pedindo: null, falando: {}, local: null, remotos: {}, ampliado: null });
  }

  /** Para depurar e para os roteiros de teste: as ligações e o que chegou de cada um. */
  diagnostico() {
    const { remotos, falando } = useMidia.getState();
    return {
      eu: this.eu,
      pares: Object.fromEntries([...this.pares].map(([id, p]) => [id, { conectado: p.peer.connected, inicia: p.inicia }])),
      audios: this.audios.size,
      remotos: Object.fromEntries(Object.entries(remotos).map(([id, s]) => [id, s.getTracks().filter((t) => t.readyState === 'live').map((t) => t.kind)])),
      falando: Object.keys(falando),
      meu: (this.meuStream?.getTracks() ?? []).map((t) => `${t.kind}:${t.enabled ? 'on' : 'off'}`),
    };
  }
}

export const midia = new MidiaDaMesa();

if (typeof window !== 'undefined') (window as unknown as { __midia?: MidiaDaMesa }).__midia = midia;
