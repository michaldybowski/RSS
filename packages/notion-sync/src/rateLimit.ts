/**
 * Ograniczanie tempa i ponowienia (specyfikacja 5.3).
 *
 * Notion API przyjmuje około trzech żądań na sekundę. Przekroczenie limitu
 * kończy się odrzuceniem, a przy pełnym imporcie kilkuset stron oznacza
 * to import częściowy — czyli cache rozjechany z Notion bez żadnego sygnału.
 *
 * Zegar i uśpienie są wstrzykiwane, żeby testy nie czekały naprawdę.
 */

export interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface RateLimitOptions {
  /** Minimalny odstęp między żądaniami. Domyślnie 350 ms ≈ 2,9 żądania/s. */
  minIntervalMs?: number;
  maxRetries?: number;
  /** Bazowe opóźnienie ponowienia; rośnie wykładniczo. */
  baseBackoffMs?: number;
}

/** Błąd, na który warto ponowić: limit tempa lub chwilowa niedostępność. */
export class TransientNotionError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TransientNotionError';
  }
}

export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private lastCallAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly clock: Clock = systemClock,
    options: RateLimitOptions = {},
  ) {
    this.minIntervalMs = options.minIntervalMs ?? 350;
    this.maxRetries = options.maxRetries ?? 4;
    this.baseBackoffMs = options.baseBackoffMs ?? 500;
  }

  /**
   * Wykonuje żądanie, pilnując odstępu i ponawiając błędy przejściowe.
   * Błąd trwały (np. zły identyfikator bazy) leci dalej bez ponowień —
   * ponawianie go tylko opóźnia informację o problemie.
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;

    for (;;) {
      await this.waitForSlot();

      try {
        this.lastCallAt = this.clock.now();
        return await operation();
      } catch (error) {
        if (!(error instanceof TransientNotionError) || attempt >= this.maxRetries) throw error;

        const backoff = error.retryAfterMs ?? this.baseBackoffMs * 2 ** attempt;
        attempt += 1;
        await this.clock.sleep(backoff);
      }
    }
  }

  private async waitForSlot(): Promise<void> {
    const elapsed = this.clock.now() - this.lastCallAt;
    if (elapsed < this.minIntervalMs) {
      await this.clock.sleep(this.minIntervalMs - elapsed);
    }
  }
}
