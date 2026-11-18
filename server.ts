import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const GEOCODING_V4_BASE = 'https://geocode.googleapis.com/v4/geocode/address/';
const GEMINI_MODEL = 'gemini-3.8-flash';
const FIELD_MASK = [
  'results.place',
  'results.placeId',
  'results.location',
  'results.granularity',
  'results.viewport',
  'results.formattedAddress',
  'results.postalAddress',
  'results.addressComponents',
  'results.types',
  'results.plusCode',
].join(',');

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeInsightsHtml(rawText: string): string {
  let cleaned = rawText
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Extract the first <ul>...</ul> block if extra prose surrounded it
  const ulMatch = cleaned.match(/<ul\b[^>]*>[\s\S]*?<\/ul>/i);
  if (ulMatch) {
    cleaned = ulMatch[0];
  }

  // Strip dangerous elements and event handlers while preserving clean list/inline formatting
  cleaned = cleaned
    .replace(/<(script|style|iframe|object|embed|svg|img|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|svg|img|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');

  // Keep only safe structural/inline tags
  cleaned = cleaned.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (_full, tag: string) => {
    const lower = tag.toLowerCase();
    if (['ul', 'li', 'strong', 'em', 'b', 'i', 'br'].includes(lower)) {
      const isClosing = _full.startsWith('</');
      if (lower === 'br') return '<br />';
      return isClosing ? `</${lower}>` : `<${lower}>`;
    }
    return '';
  });

  if (!/<li\b/i.test(cleaned)) {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s*\-•\d.]+/, '').trim())
      .filter((line) => line.length > 0 && !line.startsWith('```'))
      .slice(0, 3);
    if (lines.length === 0) {
      return '';
    }
    const escaped = lines.map(
      (line) =>
        `<li>${line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</li>`
    );
    return `<ul>${escaped.join('')}</ul>`;
  }

  if (!/<ul\b/i.test(cleaned)) {
    cleaned = `<ul>${cleaned}</ul>`;
  }

  return cleaned.trim();
}

function extractGeminiError(err: unknown): {
  code: number;
  status: string;
  message: string;
  hint: string;
} {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  let statusCode = 500;
  let statusText = 'GEMINI_API_ERROR';
  let hint = 'Please try refreshing local insights in a moment.';

  if (
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('400') && lower.includes('key')
  ) {
    statusCode = lower.includes('403') ? 403 : 400;
    statusText = lower.includes('permission_denied') ? 'PERMISSION_DENIED' : 'API_KEY_INVALID';
    hint = 'Check your Gemini API key configuration in the Settings > Secrets panel.';
  } else if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    statusCode = 429;
    statusText = 'RESOURCE_EXHAUSTED';
    hint = 'Gemini API rate limit or quota was reached. Wait briefly before retrying.';
  } else if (lower.includes('404') || lower.includes('not_found')) {
    statusCode = 404;
    statusText = 'MODEL_NOT_FOUND';
    hint = `The configured Gemini model (${GEMINI_MODEL}) could not be resolved by the API.`;
  } else if (lower.includes('network') || lower.includes('fetch failed') || lower.includes('timeout')) {
    statusCode = 502;
    statusText = 'UPSTREAM_NETWORK_ERROR';
    hint = 'Verify outbound network connectivity to the Gemini API and try again.';
  }

  return {
    code: statusCode,
    status: statusText,
    message: rawMessage || 'Unable to generate local insights right now.',
    hint,
  };
}

function buildTroubleshootingHint(statusCode: number, apiStatus?: string, message?: string): string {
  const lowerMsg = (message || '').toLowerCase();

  if (statusCode === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return 'Google Maps Platform request quota has been reached. Wait before retrying or upgrade your billing account quota.';
  }
  if (statusCode === 403 || apiStatus === 'PERMISSION_DENIED') {
    if (lowerMsg.includes('referer') || lowerMsg.includes('referrer')) {
      return 'Your API key has HTTP referrer restrictions that block this request origin. Update the allowed referrers or use an API-restricted server key.';
    }
    if (lowerMsg.includes('not been used') || lowerMsg.includes('disabled')) {
      return 'Ensure the Geocoding API is enabled on the Google Cloud project associated with your API key.';
    }
    return 'Verify that your Google Maps API key is valid, unrestricted for server calls (or includes Geocoding API), and has billing enabled.';
  }
  if (statusCode === 400 || apiStatus === 'INVALID_ARGUMENT') {
    return 'Check the search query format. Avoid passing raw coordinates or unsupported characters to the address geocoding endpoint.';
  }
  if (statusCode >= 500) {
    return 'Google Geocoding V4 experienced a temporary upstream error. Wait a moment and retry your request.';
  }
  return 'Inspect the error details above, verify your network connection, and try refining your location query.';
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/config', (_req: Request, res: Response) => {
    const apiKey = getMapsApiKey();
    res.json({
      hasApiKey: apiKey.length > 0,
      apiKey,
    });
  });

  app.get('/api/geocode', async (req: Request, res: Response) => {
    const rawAddress = typeof req.query.address === 'string' ? req.query.address : '';
    const trimmedAddress = rawAddress.trim();

    if (!trimmedAddress) {
      res.status(400).json({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Please enter a city, neighborhood, landmark, or street address to geocode.',
          hint: 'Type a location in the search bar or choose one of the featured presets.',
          endpoint: GEOCODING_V4_BASE,
        },
      });
      return;
    }

    if (trimmedAddress.length > 512) {
      res.status(400).json({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'Location query exceeds the maximum supported length of 512 characters.',
          hint: 'Shorten the address or query to a city, neighborhood, or street address.',
          endpoint: GEOCODING_V4_BASE,
        },
      });
      return;
    }

    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({
        error: {
          code: 503,
          status: 'API_KEY_MISSING',
          message: 'Google Maps API key is not configured on the server.',
          hint: 'Configure GOOGLE_MAPS_API_KEY (or VITE_GOOGLE_MAPS_API_KEY) via the Google Maps setup panel or environment secrets and restart the server.',
          endpoint: GEOCODING_V4_BASE,
        },
      });
      return;
    }

    const encodedAddress = encodeURIComponent(trimmedAddress);
    const targetUrl = `${GEOCODING_V4_BASE}${encodedAddress}?languageCode=en`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
      'X-Goog-FieldMask': FIELD_MASK,
    };

    const incomingReferer = req.headers.referer || req.headers.origin;
    if (
      typeof incomingReferer === 'string' &&
      (incomingReferer.startsWith('https://') || incomingReferer.startsWith('http://'))
    ) {
      headers['Referer'] = incomingReferer;
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: 'GET',
        headers,
      });

      const rawText = await upstreamRes.text();
      let parsedBody: Record<string, unknown> = {};
      if (rawText) {
        try {
          parsedBody = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          parsedBody = { rawText };
        }
      }

      if (!upstreamRes.ok) {
        const errObj =
          typeof parsedBody.error === 'object' && parsedBody.error !== null
            ? (parsedBody.error as Record<string, unknown>)
            : {};
        const apiStatus =
          typeof errObj.status === 'string' ? errObj.status : `HTTP_${upstreamRes.status}`;
        const apiMessage =
          typeof errObj.message === 'string'
            ? errObj.message
            : `Geocoding V4 request failed with HTTP ${upstreamRes.status}.`;

        res.status(upstreamRes.status).json({
          error: {
            code: upstreamRes.status,
            status: apiStatus,
            message: apiMessage,
            hint: buildTroubleshootingHint(upstreamRes.status, apiStatus, apiMessage),
            endpoint: `${GEOCODING_V4_BASE}{address}`,
          },
        });
        return;
      }

      const results = Array.isArray(parsedBody.results) ? parsedBody.results : [];
      res.status(200).json({
        query: trimmedAddress,
        endpoint: `${GEOCODING_V4_BASE}${encodedAddress}`,
        results,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Network error while reaching Google Geocoding V4.';
      res.status(502).json({
        error: {
          code: 502,
          status: 'UPSTREAM_NETWORK_ERROR',
          message,
          hint: 'Check outbound network connectivity from the server and verify https://geocode.googleapis.com is reachable.',
          endpoint: `${GEOCODING_V4_BASE}{address}`,
        },
      });
    }
  });

  app.post('/api/local-insights', async (req: Request, res: Response) => {
    const rawLocation =
      typeof req.body?.location === 'string' ? req.body.location.trim() : '';

    if (!rawLocation) {
      res.status(400).json({
        error: {
          code: 400,
          status: 'INVALID_ARGUMENT',
          message: 'A valid city or location name is required to generate local insights.',
          hint: 'Search for or select a destination first.',
        },
      });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: {
          code: 503,
          status: 'GEMINI_KEY_MISSING',
          message: 'Gemini API key is not configured on the server.',
          hint: 'Check GEMINI_API_KEY in the Settings > Secrets panel and restart the server.',
        },
      });
      return;
    }

    const prompt = `You are a local tour guide for ${rawLocation}. Give me exactly 3 short, highly engaging, and unusual or surprising fun facts about this place. Keep each fact under 2 sentences. Format the response as a clean HTML unordered list (<ul>) so I can inject it directly.`;

    const callModel = async () => {
      return ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
    };

    try {
      let response;
      try {
        response = await callModel();
      } catch (firstErr: unknown) {
        const msg = firstErr instanceof Error ? firstErr.message.toLowerCase() : '';
        if (msg.includes('503') || msg.includes('500') || msg.includes('unavailable')) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          response = await callModel();
        } else {
          throw firstErr;
        }
      }

      const rawOutput = (response.text ?? '').trim();
      const html = sanitizeInsightsHtml(rawOutput);

      if (!html) {
        res.status(502).json({
          error: {
            code: 502,
            status: 'EMPTY_INSIGHTS_RESPONSE',
            message: `Gemini returned an empty or unreadable response for ${rawLocation}.`,
            hint: 'Try requesting local insights again.',
          },
        });
        return;
      }

      res.status(200).json({
        location: rawLocation,
        model: GEMINI_MODEL,
        html,
      });
    } catch (err: unknown) {
      const parsedErr = extractGeminiError(err);
      res.status(parsedErr.code).json({
        error: parsedErr,
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Block Explorer server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Block Explorer server:', err);
  process.exit(1);
});
