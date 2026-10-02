import type { PlayerView } from '@fodinha/engine';
import { useEffect } from 'react';
import { useZoeira } from './agenda';
import { DURACAO, type CenaDeAssento, type Enfeites } from './diretor';

/**
 * Só no desenvolvimento, junto com as cenas (`?cena=`): força a zoeira para olhar sem esperar o lance.
 * `?enfeites=1` veste os assentos (líder de mão quente, pé-frio, borracho com lanterna…);
 * `?zoeira=vaca|traira|chinelada|fala|coro|fregues|cinzeiro` põe a cena no primeiro adversário (ou no
 * meio da mesa) um segundo depois de abrir, e de novo a cada cinco.
 */
const param = (nome: string) => new URLSearchParams(window.location.search).get(nome);

const AMOSTRAS: Enfeites[] = [
  { borracho: 0, quente: 5, frio: 0, lider: true, lanterna: false, epitafio: null },
  { borracho: 2, quente: 0, frio: 3, lider: false, lanterna: false, epitafio: null },
  { borracho: 3, quente: 0, frio: 0, lider: false, lanterna: true, epitafio: null },
  { borracho: 1, quente: 3, frio: 0, lider: false, lanterna: false, epitafio: null },
  { borracho: 2, quente: 0, frio: 0, lider: false, lanterna: false, epitafio: null },
];

export function enfeitesDeTeste(view: PlayerView): Map<string, Enfeites> | null {
  if (!param('enfeites')) return null;
  const outros = view.players.filter((p) => p.id !== view.you);
  const m = new Map<string, Enfeites>(outros.map((p, i) => [p.id, AMOSTRAS[i % AMOSTRAS.length]!]));
  if (view.you) m.set(view.you, AMOSTRAS[2]!);
  return m;
}

export function useZoeiraDeTeste(view: PlayerView): void {
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
      if (qual === 'vaca' || qual === 'traira' || qual === 'chinelada') {
        useZoeira.setState({ cenas: { [alvo]: { tipo: qual as CenaDeAssento, chave } } });
        window.setTimeout(() => useZoeira.setState({ cenas: {} }), DURACAO[qual as CenaDeAssento]);
      } else if (qual === 'fala') {
        useZoeira.setState({ faixa: { chave, texto: 'Devagarzito como enterro de viúva rica, Thomas.', coro: false } });
        window.setTimeout(() => useZoeira.setState({ faixa: null }), DURACAO.fala);
      } else if (qual === 'coro') {
        useZoeira.setState({ faixa: { chave, texto: 'Cagão!', coro: true } });
        window.setTimeout(() => useZoeira.setState({ faixa: null }), DURACAO.coro);
      } else if (qual === 'fregues') {
        useZoeira.setState({ palco: { chave, fregues: alvo, dono: outro } });
        window.setTimeout(() => useZoeira.setState({ palco: null }), DURACAO.fregues);
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
