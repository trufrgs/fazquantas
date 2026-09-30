/** O pedaço do `@thaunknown/simple-peer` que a conversa por voz usa (o pacote não traz tipos). */
declare module '@thaunknown/simple-peer' {
  export interface PeerOptions {
    initiator?: boolean;
    stream?: MediaStream;
    trickle?: boolean;
    config?: RTCConfiguration;
  }
  export default class Peer {
    constructor(opts?: PeerOptions);
    signal(data: unknown): void;
    destroy(err?: Error): void;
    readonly destroyed: boolean;
    readonly connected: boolean;
    on(event: 'signal', cb: (data: unknown) => void): this;
    on(event: 'stream', cb: (stream: MediaStream) => void): this;
    on(event: 'connect' | 'close', cb: () => void): this;
    on(event: 'error', cb: (err: Error) => void): this;
  }
}
