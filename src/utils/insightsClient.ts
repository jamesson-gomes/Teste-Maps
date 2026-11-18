import type { LocalInsightsErrorDetails } from '../types/geocode';

export class InsightsRequestError extends Error {
  public readonly details: LocalInsightsErrorDetails;

  constructor(details: LocalInsightsErrorDetails) {
    super(details.message);
    this.name = 'InsightsRequestError';
    this.details = details;
  }
}

export interface LocalInsightsResponse {
  location: string;
  model: string;
  html: string;
}

export async function fetchLocalInsights(
  locationLabel: string,
  signal?: AbortSignal
): Promise<LocalInsightsResponse> {
  let res: Response;
  try {
    res = await fetch('/api/local-insights', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ location: locationLabel }),
      signal,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    throw new InsightsRequestError({
      code: 0,
      status: 'NETWORK_ERROR',
      message:
        err instanceof Error
          ? err.message
          : 'Unable to connect to the Local Insights service.',
      hint: 'Check your network connection and try refreshing Local Insights.',
    });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new InsightsRequestError({
      code: res.status,
      status: 'INVALID_RESPONSE',
      message: `Local Insights returned an unexpected response (HTTP ${res.status}).`,
      hint: 'Please retry in a moment.',
    });
  }

  if (!res.ok) {
    const errObj =
      typeof payload.error === 'object' && payload.error !== null
        ? (payload.error as Partial<LocalInsightsErrorDetails>)
        : {};
    throw new InsightsRequestError({
      code: errObj.code ?? res.status,
      status: errObj.status ?? `HTTP_${res.status}`,
      message:
        errObj.message ??
        `Could not load local insights (HTTP ${res.status}).`,
      hint:
        errObj.hint ??
        'Verify your Gemini API key configuration and try again.',
    });
  }

  const html = typeof payload.html === 'string' ? payload.html : '';
  if (!html) {
    throw new InsightsRequestError({
      code: 502,
      status: 'EMPTY_INSIGHTS',
      message: `No local insights were returned for ${locationLabel}.`,
      hint: 'Click Retry to request insights again.',
    });
  }

  return {
    location:
      typeof payload.location === 'string' ? payload.location : locationLabel,
    model: typeof payload.model === 'string' ? payload.model : 'gemini-3.8-flash',
    html,
  };
}
