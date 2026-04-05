type SleepFn = (ms: number) => Promise<void>
type NowFn = () => number

export const DEFAULT_FULL_TEXT_HOSTNAME_RATE_LIMIT_MS = 60_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

class HostnameRateLimiter {
  private tails = new Map<string, Promise<void>>()
  private nextAllowedAt = new Map<string, number>()

  constructor(
    private intervalMs: number,
    private now: NowFn = Date.now,
    private wait: SleepFn = sleep,
  ) {}

  async run<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(hostname) ?? Promise.resolve()

    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const tail = previous.then(() => gate, () => gate)
    this.tails.set(hostname, tail)

    await previous

    try {
      const now = this.now()
      const nextAllowedAt = this.nextAllowedAt.get(hostname) ?? now
      const waitMs = Math.max(0, nextAllowedAt - now)
      if (waitMs > 0) {
        await this.wait(waitMs)
      }
      this.nextAllowedAt.set(hostname, this.now() + this.intervalMs)
      return await fn()
    } finally {
      release()
      if (this.tails.get(hostname) === tail) {
        this.tails.delete(hostname)
      }
    }
  }
}

function createLimiter(overrides?: {
  intervalMs?: number
  now?: NowFn
  sleep?: SleepFn
}): HostnameRateLimiter {
  const envIntervalMs = Number(process.env.FULL_TEXT_HOSTNAME_RATE_LIMIT_MS)
  return new HostnameRateLimiter(
    overrides?.intervalMs ?? (Number.isFinite(envIntervalMs) && envIntervalMs >= 0
      ? envIntervalMs
      : DEFAULT_FULL_TEXT_HOSTNAME_RATE_LIMIT_MS),
    overrides?.now,
    overrides?.sleep,
  )
}

let fullTextHostnameLimiter = createLimiter()

export function runWithFullTextHostnameRateLimit<T>(
  articleUrl: string,
  fn: () => Promise<T>,
): Promise<T> {
  let hostname: string | null = null
  try {
    hostname = new URL(articleUrl).hostname.toLowerCase()
  } catch {
    hostname = null
  }

  if (!hostname) {
    return fn()
  }

  return fullTextHostnameLimiter.run(hostname, fn)
}

export function configureFullTextHostnameRateLimiterForTests(overrides: {
  intervalMs?: number
  now?: NowFn
  sleep?: SleepFn
}): void {
  fullTextHostnameLimiter = createLimiter(overrides)
}

export function resetFullTextHostnameRateLimiterForTests(): void {
  fullTextHostnameLimiter = createLimiter()
}
