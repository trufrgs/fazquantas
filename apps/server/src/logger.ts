export interface Logger {
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
}

const stamp = () => new Date().toISOString();

export const consoleLogger: Logger = {
  info: (message, ...details) => console.log(`${stamp()} ${message}`, ...details),
  warn: (message, ...details) => console.warn(`${stamp()} ${message}`, ...details),
  error: (message, ...details) => console.error(`${stamp()} ${message}`, ...details),
};

/** Para os testes: não imprime nada. */
export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
