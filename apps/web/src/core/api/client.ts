import type { ErrorEnvelope } from './types';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Held in memory, never localStorage — anything localStorage can read, an
 * injected script can read too. The cost is that a page reload loses it, which
 * is why AuthProvider calls refresh() on mount to restore the session.
 */
let accessToken: string | null = null;

/** Shared in-flight refresh. See the single-flight note below. */
let refreshInFlight: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      accessToken = null;
      return false;
    }

    const body = (await response.json()) as { data: { accessToken: string } };
    accessToken = body.data.accessToken;
    return true;
  } catch {
    accessToken = null;
    return false;
  }
}

/**
 * SINGLE-FLIGHT. If ten requests expire at once, they must produce ONE refresh
 * call, not ten. The backend rotates refresh tokens and treats a replayed token
 * as theft — ten parallel refreshes would revoke the whole session family and
 * sign the user out. Everyone after the first awaits the same promise.
 */
function refreshSession(): Promise<boolean> {
  const pending =
    refreshInFlight ??
    (refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    }));

  return pending;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  allowRetry = true,
): Promise<T> {
  let response: Response;

  try {
    response = await request(path, init);
  } catch (cause) {
    throw new ApiError(
      'NETWORK_UNREACHABLE',
      cause instanceof Error ? cause.message : 'Could not reach the API',
      0,
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as ErrorEnvelope | null)?.error;

    // Only TOKEN_EXPIRED is retryable. Any other 401 means the session is
    // genuinely dead, and retrying would loop.
    if (response.status === 401 && error?.code === 'TOKEN_EXPIRED' && allowRetry) {
      if (await refreshSession()) {
        return apiFetch<T>(path, init, false);
      }
    }

    throw new ApiError(
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? response.statusText,
      response.status,
      error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
      error?.details,
    );
  }

  return (body as { data: T }).data;
}

/** Used only by AuthProvider on mount, where a failure is normal (not logged in). */
export { refreshSession };
