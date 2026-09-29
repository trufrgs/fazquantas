import { useEffect, useState } from 'react';
import { serverUrl } from './platform';

export interface Manutencao {
  ativa: boolean;
  mensagem: string;
  desde: number | null;
}

/**
 * O servidor está em manutenção (salas novas barradas)? Pergunta ao abrir a tela; sem resposta,
 * segue como se não estivesse (o servidor recusa de qualquer jeito, com a mensagem).
 */
export function useManutencao(): Manutencao | null {
  const [m, setM] = useState<Manutencao | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`${serverUrl()}/api/status`, { cache: 'no-store' })
      .then((r) => r.json() as Promise<{ manutencao?: Manutencao }>)
      .then((d) => {
        if (vivo && d.manutencao?.ativa) setM(d.manutencao);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return m;
}
