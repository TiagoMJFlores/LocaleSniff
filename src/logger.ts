export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function makeLogger(verbose: boolean): Logger {
  return {
    debug: verbose ? (...a) => console.error('[debug]', ...a) : () => {},
    info: (...a) => console.error('[info]', ...a),
    warn: (...a) => console.error('[warn]', ...a),
    error: (...a) => console.error('[error]', ...a),
  };
}
