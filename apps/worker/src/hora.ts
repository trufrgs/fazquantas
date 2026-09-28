/** "21:40" (hoje), "amanhã às 09:15" ou "sex. às 09:15", no horário de Brasília. */
export function horaBrasilia(at: number, now = Date.now()): string {
  const tz = 'America/Sao_Paulo';
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(at);
  const dia = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(t);
  if (dia(at) === dia(now)) return hora;
  if (dia(at) === dia(now + 86_400_000)) return `amanhã às ${hora}`;
  const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, weekday: 'short' }).format(at);
  return `${semana} às ${hora}`;
}
