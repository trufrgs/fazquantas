/** Contas do relógio da vez (sem React, para testar). */

/** "23 s", "1:05", "5 h 12" (em horas não precisa dos segundos). */
export function formatLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
  }
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${s} s`;
}

/**
 * Tempo apertado: nos últimos 10 s (ou na metade final, se a vez é curta); em vez de horas, no último
 * quarto do prazo (quando sai o lembrete).
 */
export function isUrgent(leftMs: number, totalMs: number | null): boolean {
  if (!totalMs) return leftMs <= 10_000;
  if (totalMs >= 3_600_000) return leftMs <= totalMs / 4;
  return leftMs <= Math.min(10_000, totalMs * 0.5);
}
