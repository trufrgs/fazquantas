/** O pedaço do `@thaunknown/simple-peer` que o microfone e a câmera da mesa usam (o pacote não traz tipos). */
declare module '@thaunknown/simple-peer' {
  export interface PeerOptions {
    initiator?: boolean;
    stream?: MediaStream;
    trickle?: boolean;
    config?: RTCConfiguration;
    offerOptions?: RTCOfferOptions & { offerToReceiveAudio?: boolean; offerToReceiveVideo?: boolean };
    sdpTransform?: (sdp: string) => string;
  }
  export default class Peer {
    constructor(opts?: PeerOptions);
    signal(data: unknown): void;
    addTrack(track: MediaStreamTrack, stream: MediaStream): void;
    removeTrack(track: MediaStreamTrack, stream: MediaStream): void;
    destroy(err?: Error): void;
    readonly destroyed: boolean;
    readonly connected: boolean;
    on(event: 'signal', cb: (data: unknown) => void): this;
    on(event: 'stream', cb: (stream: MediaStream) => void): this;
    on(event: 'track', cb: (track: MediaStreamTrack, stream: MediaStream) => void): this;
    on(event: 'connect' | 'close', cb: () => void): this;
    on(event: 'error', cb: (err: Error) => void): this;
  }
}
