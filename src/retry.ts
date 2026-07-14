import { Logger } from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
  retryableErrors?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta una función con reintentos y backoff exponencial.
 *
 * Reintenta cuando:
 * - El error tiene status 429 (Too Many Requests).
 * - El mensaje indica timeout o fallo de red.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  logger: Logger,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 60000;
  const retryableStatuses = options.retryableStatuses ?? [429, 503, 502, 504];
  const retryableErrors = options.retryableErrors ?? [
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'socket hang up',
    'network',
  ];

  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;
      const message = err.message?.toLowerCase() ?? '';
      const isRetryable =
        retryableStatuses.includes(status) ||
        retryableErrors.some((e) => message.includes(e.toLowerCase()));

      if (!isRetryable || attempt === maxAttempts) {
        throw err;
      }

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = Math.floor(Math.random() * (delay * 0.5));
      const totalDelay = delay + jitter;

      logger.warn(
        `Intento ${attempt}/${maxAttempts} fallido (status ${status ?? 'N/A'}): ${err.message}. Reintentando en ${totalDelay}ms...`
      );
      await sleep(totalDelay);
    }
  }

  throw lastError;
}

/**
 * Pausa con un delay base más un jitter aleatorio.
 */
export async function politeDelay(baseMs: number, randomMs: number): Promise<void> {
  const delay = baseMs + Math.floor(Math.random() * randomMs);
  await sleep(delay);
}
