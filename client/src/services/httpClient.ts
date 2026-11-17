
import {
  getAccessToken,
  refreshSession,
  clearAccessToken,
} from './authClient';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Params = Record<string, string | number | undefined>;

const BASE = import.meta.env.VITE_API_BASE ?? '/api';


async function sendRequest(
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  const token = getAccessToken();

  return fetch(url, {
    signal,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}


async function errorFromResponse(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;

  try {
    const body = await res.json();
    const err = body?.error;

    if (err?.message) {
      message = err.details?.length
        ? `${err.message}: ${err.details.join('; ')}`
        : err.message;
    }
  } catch {
    // Ignore non-JSON response.
  }

  return new ApiError(message, res.status);
}

export async function getJson<T>(
  path: string,
  params: Params,
  guard: (v: unknown) => v is T,
  signal?: AbortSignal
): Promise<T> {
  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }

  const query = qs.toString();
  const url = `${BASE}${path}${query ? `?${query}` : ''}`;

  let res: Response;

  try {
    res = await sendRequest(url, signal);

    if (res.status === 401) {
      try {
        await refreshSession();
        res = await sendRequest(url, signal);
      } catch {
        clearAccessToken();
        throw new ApiError('Your session has expired. Please sign in again.', 401);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'Cannot reach the server. Check that the API is running and try again.',
      0
    );
  }

  if (!res.ok) throw await errorFromResponse(res);

  const body: unknown = await res.json();

  if (!guard(body)) {
    throw new ApiError('The server returned an unexpected response.', 502);
  }

  return body;
}
