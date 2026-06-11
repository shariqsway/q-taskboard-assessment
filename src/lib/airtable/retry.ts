import { AirtableError } from "@/lib/airtable-mock";

export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  return ms + Math.floor(Math.random() * 200);
}

export function isRetryableError(err: unknown): boolean {
  if (err instanceof AirtableError) {
    return err.statusCode === 429 || err.statusCode === 0 || err.statusCode >= 500;
  }
  if (err && typeof err === "object" && "statusCode" in err) {
    const code = (err as { statusCode: number }).statusCode;
    return code === 429 || code === 0 || code >= 500;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("network") || msg.includes("timeout") || msg.includes("econnreset");
  }
  return false;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 800;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isRetryableError(err) || attempt === maxAttempts) throw err;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(jitter(delay));
    }
  }
  throw lastError;
}
