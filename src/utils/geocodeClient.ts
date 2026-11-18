import type { GeocodeErrorDetails, GeocodeSuccessResponse } from '../types/geocode';

export class GeocodeRequestError extends Error {
  public readonly details: GeocodeErrorDetails;

  constructor(details: GeocodeErrorDetails) {
    super(details.message);
    this.name = 'GeocodeRequestError';
    this.details = details;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeSuccessResponse> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new GeocodeRequestError({
      code: 400,
      status: 'INVALID_ARGUMENT',
      message: 'Please enter a city, neighborhood, landmark, or street address.',
      hint: 'Type a location into the search field or click one of the five featured presets.',
      endpoint: 'https://geocode.googleapis.com/v4/geocode/address/',
    });
  }

  let res: Response;
  try {
    res = await fetch(`/api/geocode?address=${encodeURIComponent(trimmed)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Unable to reach the Block Explorer geocoding proxy.';
    throw new GeocodeRequestError({
      code: 0,
      status: 'NETWORK_ERROR',
      message: msg,
      hint: 'Check your internet connection and verify the Block Explorer server is running.',
      endpoint: 'https://geocode.googleapis.com/v4/geocode/address/',
    });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new GeocodeRequestError({
      code: res.status,
      status: 'INVALID_RESPONSE',
      message: `Server returned a non-JSON response (HTTP ${res.status}).`,
      hint: 'Check server logs for unexpected errors or restart the development server.',
      endpoint: 'https://geocode.googleapis.com/v4/geocode/address/',
    });
  }

  const errorPayload =
    typeof payload.error === 'object' && payload.error !== null
      ? (payload.error as Partial<GeocodeErrorDetails>)
      : null;

  if (res.status === 429 || errorPayload?.status === 'RESOURCE_EXHAUSTED') {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }

  if (!res.ok) {
    throw new GeocodeRequestError({
      code: errorPayload?.code ?? res.status,
      status: errorPayload?.status ?? `HTTP_${res.status}`,
      message:
        errorPayload?.message ??
        `Geocoding request failed with HTTP status ${res.status}.`,
      hint:
        errorPayload?.hint ??
        'Verify your Google Maps API key permissions and ensure Geocoding API is enabled.',
      endpoint:
        errorPayload?.endpoint ??
        'https://geocode.googleapis.com/v4/geocode/address/',
    });
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  if (results.length === 0) {
    throw new GeocodeRequestError({
      code: 404,
      status: 'ZERO_RESULTS',
      message: `No geographic coordinates found for "${trimmed}".`,
      hint: 'Try adding a city, country, or postal code (for example, "Shibuya, Tokyo" or "Cologne, Germany"), or check spelling.',
      endpoint:
        typeof payload.endpoint === 'string'
          ? payload.endpoint
          : 'https://geocode.googleapis.com/v4/geocode/address/',
    });
  }

  return {
    query: typeof payload.query === 'string' ? payload.query : trimmed,
    endpoint:
      typeof payload.endpoint === 'string'
        ? payload.endpoint
        : 'https://geocode.googleapis.com/v4/geocode/address/',
    results,
  } as GeocodeSuccessResponse;
}
