import type { PlayerView } from '@fodinha/engine';
import { useEffect, useRef, useState } from 'react';
import type { LiveReaction } from '../../../stores/game';
import { Agenda, type Contexto } from './agenda';

/**
 * Liga a agenda da zoeira à mesa: cada visão, cada frase e cada demora passam por ela. Uma agenda por
 * mesa montada (a mesa remonta a cada partida, então a conta de fregueses e bitucas recomeça).
 */
export function useDiretor(o: { view: PlayerView; reactions: readonly LiveReaction[]; demorando: boolean } & Contexto): void {
  const [agenda] = useState(() => new Agenda());
  const { view, reactions, demorando, avatarDe, ativa, calma, aoVivo } = o;
  useEffect(() => {
    agenda.comecar();
    return () => agenda.parar();
  }, [agenda]);
  useEffect(() => {
    agenda.ver(view, { avatarDe, ativa, calma, aoVivo });
  }, [agenda, view, avatarDe, ativa, calma, aoVivo]);
  // As frases: cada uma passa uma vez (a loja guarda cada frase por uns segundos).
  const ouvidas = useRef(0);
  useEffect(() => {
    for (const r of reactions) {
      if (r.key <= ouvidas.current) continue;
      ouvidas.current = r.key;
      agenda.ouvir(r.playerId, r.reaction);
    }
  }, [agenda, reactions]);
  // Os palheiros acenderam: uma bituca por quem espera, na conta de quem demora.
  useEffect(() => {
    const ator = view.actor?.playerId;
    if (!demorando || !ator || !aoVivo) return;
    agenda.demorou(ator, view.players.filter((p) => !p.eliminated && p.id !== ator).length);
    // Uma vez por demora: a visão é a mesma enquanto ela dura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, demorando]);
}
