import { afterEach, describe, expect, it, vi } from 'vitest';
import { shareInvite } from './platform';

const SITE = 'https://fazquantas.pages.dev';

afterEach(() => vi.unstubAllGlobals());

describe('convite para a sala', () => {
  it('no menu de compartilhar, o link vai uma vez só (o WhatsApp junta texto e link)', async () => {
    const share = vi.fn(async (_dados: ShareData) => undefined);
    vi.stubGlobal('window', { location: { origin: SITE } });
    vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
    expect(await shareInvite('RMT9')).toBe('shared');
    const dados = share.mock.calls[0]![0];
    expect(dados.url).toBe(`${SITE}/?sala=RMT9`);
    expect(dados.text).toBe('Buenas! Bora uma Fodinha? Entra na sala RMT9:');
    expect(`${dados.text} ${dados.url}`.split(`${SITE}/?sala=RMT9`)).toHaveLength(2);
  });

  it('sem menu de compartilhar, copia a mensagem com o link uma vez', async () => {
    const writeText = vi.fn(async (_t: string) => undefined);
    vi.stubGlobal('window', { location: { origin: SITE } });
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await shareInvite('RMT9')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(`Buenas! Bora uma Fodinha? Entra na sala RMT9: ${SITE}/?sala=RMT9`);
  });
});
