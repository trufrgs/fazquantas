import { describe, expect, it } from 'vitest';
import { limitarVideo } from './midia';

describe('microfone e câmera', () => {
  it('limita a banda só do vídeo, logo depois da linha de conexão', () => {
    const sdp = ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'c=IN IP4 0.0.0.0', 'b=AS:2000', 'a=mid:1', ''].join('\r\n');
    const saida = limitarVideo(sdp).split('\r\n');
    expect(saida).toEqual(['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'm=video 9 UDP/TLS/RTP/SAVPF 96', 'c=IN IP4 0.0.0.0', 'b=AS:200', 'a=mid:1', '']);
  });
});
