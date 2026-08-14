import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TooManyRequestsException } from '../../common/errors/app.exception';

interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window rate limiter for the one route a hostile client can reach without a token. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, Window>();
  private readonly windowMs = 60_000;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    const limit = Number(this.config.get<number>('COVERAGE_PUBLIC_RATE_LIMIT')) || 120;
    const key = request.ip ?? 'unknown';

    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }

    window.count += 1;

    if (window.count > limit) {
      throw new TooManyRequestsException();
    }

    // Bounded sweep: the map only grows past this when under attack, and attacking a public
    // endpoint is exactly when it should shed stale state.
    if (this.windows.size > 10_000) {
      for (const [k, w] of this.windows) {
        if (w.resetAt <= now) this.windows.delete(k);
      }
    }

    return true;
  }

  /** Drops every window. Operational escape hatch and test seam. */
  reset(): void {
    this.windows.clear();
  }
}
