import type { PlayerView } from '@fodinha/engine';
import { useEffect } from 'react';
import { DURACAO_PALCO, marcarLance, useZoeira } from './agenda';
import { DURACAO, type CenaDeAssento, type Enfeites, type Mascara } from './diretor';

/**
 * Só no desenvolvimento, junto com as cenas (`?cena=`): força a zoeira para olhar sem esperar o lance.
 * `?enfeites=1` veste os assentos (líder de mão quente, pé-frio, borracho com lanterna, galinha…);
 * `?mascaras=1` põe focinho e nariz nos rostos;
 * `?zoeira=vaca|traira|chinelada|cumadre|fala|coro|fregues|duelo|cuia|tropeco|corte|lance|galo|gato|espeto|cinzeiro` põe a cena no primeiro adversário (ou no
 * meio da mesa) um segundo depois de abrir, e de novo a cada cinco.
 */
const param = (nome: string) => new URLSearchParams(window.location.search).get(nome);

const AMOSTRAS: Enfeites[] = [
  { borracho: 0, quente: 5, frio: 0, lider: true, lanterna: false, epitafio: null, galinha: false },
  { borracho: 2, quente: 0, frio: 3, lider: false, lanterna: false, epitafio: null, galinha: false },
  { borracho: 3, quente: 0, frio: 0, lider: false, lanterna: true, epitafio: null, galinha: false },
  { borracho: 1, quente: 3, frio: 0, lider: false, lanterna: false, epitafio: null, galinha: false },
  { borracho: 2, quente: 0, frio: 0, lider: false, lanterna: false, epitafio: null, galinha: true },
];

export function enfeitesDeTeste(view: PlayerView): Map<string, Enfeites> | null {
  if (!param('enfeites')) return null;
  const outros = view.players.filter((p) => p.id !== view.you);
  const m = new Map<string, Enfeites>(outros.map((p, i) => [p.id, AMOSTRAS[i % AMOSTRAS.length]!]));
  if (view.you) m.set(view.you, AMOSTRAS[2]!);
  return m;
}

export function mascarasDeTeste(view: PlayerView): Map<string, Mascara> | null {
  if (!param('mascaras')) return null;
  return new Map(view.players.map((p, i) => [p.id, i % 2 ? 'palhaco' : 'porco'] as const));
}

export function useZoeiraDeTeste(view: PlayerView): void {
  // O lance da noite: a mão que fechar vira lance (como se a mesa tivesse caído na gargalhada).
  const fechou = view.phase === 'trickEnd' ? view.seq : null;
  useEffect(() => {
    if (import.meta.env.DEV && fechou !== null && param('zoeira') === 'lance') marcarLance(view);
    // Só quando a mão fecha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechou]);
  const outros = view.players.filter((p) => p.id !== view.you).map((p) => p.id);
  const alvo = outros[0];
  const outro = outros[1] ?? alvo;
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const qual = param('zoeira');
    if (!qual || !alvo || !outro) return undefined;
    let n = 100;
    const roda = () => {
      const chave = ++n;
      if (qual === 'vaca' || qual === 'traira' || qual === 'chinelada' || qual === 'cumadre') {
        useZoeira.setState({ cenas: { [alvo]: { tipo: qual as CenaDeAssento, chave } } });
        window.setTimeout(() => useZoeira.setState({ cenas: {} }), DURACAO[qual as CenaDeAssento]);
      } else if (qual === 'fala') {
        useZoeira.setState({ faixa: { chave, texto: 'Devagarzito como enterro de viúva rica, Thomas.', coro: false } });
        window.setTimeout(() => useZoeira.setState({ faixa: null }), DURACAO.fala);
      } else if (qual === 'coro') {
        useZoeira.setState({ faixa: { chave, texto: 'Cagão!', coro: true } });
        window.setTimeout(() => useZoeira.setState({ faixa: null }), DURACAO.coro);
      } else if (qual === 'fregues') {
        useZoeira.setState({ palco: { chave, tipo: 'fregues', fregues: alvo, dono: outro } });
        window.setTimeout(() => useZoeira.setState({ palco: null }), DURACAO.fregues);
      } else if (qual === 'duelo') {
        useZoeira.setState({ palco: { chave, tipo: 'duelo', a: alvo, b: outro } });
        window.setTimeout(() => useZoeira.setState({ palco: null }), DURACAO_PALCO.duelo);
      } else if (qual === 'cuia' || qual === 'tropeco') {
        useZoeira.setState({ palco: qual === 'cuia' ? { chave, tipo: 'cuia', pe: alvo } : { chave, tipo: 'tropeco', de: alvo } });
        window.setTimeout(() => useZoeira.setState({ palco: null }), DURACAO_PALCO[qual]);
      } else if (qual === 'corte') {
        useZoeira.setState({ palco: { chave, tipo: 'corte', quem: [alvo] } });
        window.setTimeout(() => useZoeira.setState({ palco: null }), DURACAO_PALCO.corte);
      } else if (qual === 'galo' || qual === 'gato' || qual === 'espeto') {
        useZoeira.setState({ passante: { chave, tipo: qual } });
        window.setTimeout(() => useZoeira.setState({ passante: null }), DURACAO_PALCO.passante);
      } else if (qual === 'cinzeiro') {
        const c = useZoeira.getState().cinzeiro;
        useZoeira.setState({ cinzeiro: { total: c.total + 3, por: { ...c.por, [alvo]: (c.por[alvo] ?? 0) + 3 } } });
      }
    };
    const t = window.setTimeout(roda, 1000);
    const i = window.setInterval(roda, 5000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(i);
    };
  }, [alvo, outro]);
}
