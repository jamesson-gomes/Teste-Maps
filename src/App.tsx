import { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AlertCircle, Loader2 } from 'lucide-react';
import { EditorialPanel, type HistoryEntry } from './components/EditorialPanel';
import { ExplorerMap } from './components/ExplorerMap';
import {
  extractCityStateLabel,
  type GeocodeErrorDetails,
  type GeocodeResult,
  type LocalInsightsState,
  type PresetDestination,
} from './types/geocode';
import { geocodeAddress, GeocodeRequestError } from './utils/geocodeClient';
import { fetchLocalInsights, InsightsRequestError } from './utils/insightsClient';

export default function App() {
  const [apiKey, setApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
  );
  const [isConfigLoading, setIsConfigLoading] = useState<boolean>(() => !apiKey);
  const [configError, setConfigError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [selectedResultIndex, setSelectedResultIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<GeocodeErrorDetails | null>(null);
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [insights, setInsights] = useState<LocalInsightsState | null>(null);
  const insightsAbortRef = useRef<AbortController | null>(null);

  // Listen for Tier 1 & Tier 2 Google Maps Platform quota exhaustion events
  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    const handleMapAuthError = () => {
      setError({
        code: 403,
        status: 'MAPS_AUTH_FAILURE',
        message:
          'Google Maps JavaScript API reported an authentication or authorization failure.',
        hint: 'Ensure your Google Maps API key is valid, billing is enabled, and Maps JavaScript API is active for this project.',
      });
    };
    const handleMapConsoleError = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      setError({
        code: 403,
        status: 'MAPS_JS_ERROR',
        message:
          detail?.message ||
          'Google Maps JavaScript API encountered a runtime configuration error.',
        hint: 'Check HTTP referrer restrictions and ensure Maps JavaScript API is enabled on your API key.',
      });
    };

    window.addEventListener('gmp-quota-exceeded', handleQuota);
    window.addEventListener('gmp-auth-failure', handleMapAuthError);
    window.addEventListener('gmp-map-error', handleMapConsoleError);

    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuota);
      window.removeEventListener('gmp-auth-failure', handleMapAuthError);
      window.removeEventListener('gmp-map-error', handleMapConsoleError);
    };
  }, []);

  // Cleanup pending AI request on unmount
  useEffect(() => {
    return () => {
      insightsAbortRef.current?.abort();
    };
  }, []);

  // Load Google Maps API key from server config if not baked into VITE_GOOGLE_MAPS_API_KEY
  useEffect(() => {
    if (apiKey) {
      setIsConfigLoading(false);
      return;
    }

    let cancelled = false;
    fetch('/api/config')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Configuration endpoint returned HTTP ${res.status}.`);
        }
        return (await res.json()) as { hasApiKey?: boolean; apiKey?: string };
      })
      .then((data) => {
        if (cancelled) return;
        const resolvedKey = (data.apiKey || '').trim();
        if (resolvedKey) {
          setApiKey(resolvedKey);
        } else {
          setConfigError(
            'Google Maps API key is missing. Ensure GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY is configured in the environment.'
          );
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setConfigError(
          err instanceof Error
            ? err.message
            : 'Unable to load Google Maps configuration from server.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsConfigLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  const loadLocalInsights = useCallback(async (locationLabel: string) => {
    insightsAbortRef.current?.abort();
    const controller = new AbortController();
    insightsAbortRef.current = controller;

    setInsights({
      locationLabel,
      html: null,
      isLoading: true,
      error: null,
    });

    try {
      const data = await fetchLocalInsights(locationLabel, controller.signal);
      if (controller.signal.aborted) return;

      setInsights({
        locationLabel: data.location,
        html: data.html,
        isLoading: false,
        error: null,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (err instanceof InsightsRequestError) {
        setInsights({
          locationLabel,
          html: null,
          isLoading: false,
          error: err.details,
        });
      } else {
        setInsights({
          locationLabel,
          html: null,
          isLoading: false,
          error: {
            code: 500,
            status: 'UNKNOWN_ERROR',
            message:
              err instanceof Error
                ? err.message
                : 'An unexpected error occurred while fetching Local Insights.',
            hint: 'Please try again in a moment.',
          },
        });
      }
    }
  }, []);

  const triggerInsightsForResult = useCallback(
    (result: GeocodeResult | undefined, fallbackQuery: string) => {
      if (!result) return;
      const cityState = extractCityStateLabel(result, fallbackQuery);
      if (cityState) {
        void loadLocalInsights(cityState);
      }
    },
    [loadLocalInsights]
  );

  const executeGeocode = useCallback(
    async (targetQuery: string, presetId: string | null) => {
      setIsLoading(true);
      setError(null);
      setActivePresetId(presetId);

      try {
        const response = await geocodeAddress(targetQuery);
        const primary = response.results[0];

        setResults(response.results);
        setSelectedResultIndex(0);
        setActiveQuery(response.query);
        setRecenterNonce((n) => n + 1);

        if (primary) {
          const label =
            primary.postalAddress?.locality ||
            primary.formattedAddress?.split(',')[0]?.trim() ||
            response.query;

          setHistory((prev) => {
            const filtered = prev.filter(
              (item) => item.query.toLowerCase() !== response.query.toLowerCase()
            );
            return [{ query: response.query, label, result: primary }, ...filtered].slice(
              0,
              6
            );
          });

          triggerInsightsForResult(primary, response.query);
        }
      } catch (err: unknown) {
        if (err instanceof GeocodeRequestError) {
          setError(err.details);
        } else {
          setError({
            code: 500,
            status: 'UNKNOWN_ERROR',
            message:
              err instanceof Error
                ? err.message
                : 'An unexpected error occurred while geocoding.',
            hint: 'Check your network connection and try again.',
            endpoint: 'https://geocode.googleapis.com/v4/geocode/address/',
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [triggerInsightsForResult]
  );

  const handleSearchSubmit = useCallback(
    (searchQuery: string) => {
      executeGeocode(searchQuery, null);
    },
    [executeGeocode]
  );

  const handleSelectPreset = useCallback(
    (preset: PresetDestination) => {
      setQuery(preset.label);
      executeGeocode(preset.query, preset.id);
    },
    [executeGeocode]
  );

  const handleRetry = useCallback(() => {
    const retryTarget = query.trim() || activeQuery;
    executeGeocode(retryTarget, activePresetId);
  }, [query, activeQuery, activePresetId, executeGeocode]);

  const handleSelectHistory = useCallback(
    (entry: HistoryEntry) => {
      setError(null);
      setActivePresetId(null);
      setQuery(entry.label);
      setActiveQuery(entry.query);
      setResults([entry.result]);
      setSelectedResultIndex(0);
      setRecenterNonce((n) => n + 1);
      triggerInsightsForResult(entry.result, entry.query);
    },
    [triggerInsightsForResult]
  );

  const handleSelectResultIndex = useCallback(
    (idx: number) => {
      setSelectedResultIndex(idx);
      setRecenterNonce((n) => n + 1);
      const selected = results[idx];
      if (selected) {
        triggerInsightsForResult(selected, activeQuery);
      }
    },
    [results, activeQuery, triggerInsightsForResult]
  );

  const handleRetryInsights = useCallback(() => {
    if (insights?.locationLabel) {
      void loadLocalInsights(insights.locationLabel);
    }
  }, [insights?.locationLabel, loadLocalInsights]);

  const handleDismissInsights = useCallback(() => {
    insightsAbortRef.current?.abort();
    setInsights(null);
  }, []);

  const handleMapError = useCallback((message: string) => {
    setError({
      code: 403,
      status: 'MAPS_JS_INITIALIZATION_ERROR',
      message,
      hint: 'Verify your Google Maps API key, ensure Maps JavaScript API is enabled, and check HTTP referrer restrictions.',
    });
  }, []);

  const activeResult = results[selectedResultIndex] ?? null;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-white text-slate-900 lg:overflow-hidden">
      {/* Required Demo Key Quota Banner */}
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Split-Screen Container: 1/3 Editorial Control Panel + 2/3 Full-Height Map */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0">
        <EditorialPanel
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={handleSearchSubmit}
          onSelectPreset={handleSelectPreset}
          isLoading={isLoading}
          activePresetId={activePresetId}
          activeQuery={activeQuery}
          results={results}
          selectedResultIndex={selectedResultIndex}
          onSelectResultIndex={handleSelectResultIndex}
          error={error}
          onDismissError={() => setError(null)}
          onRetry={handleRetry}
          history={history}
          onSelectHistory={handleSelectHistory}
        />

        <section
          aria-label="Interactive Google Map"
          className="w-full lg:w-2/3 h-[55vh] min-h-[380px] lg:h-full relative bg-slate-100"
        >
          {isConfigLoading ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 text-slate-600">
              <Loader2 className="w-6 h-6 animate-spin text-blue-700" />
              <p className="text-sm font-medium">Initializing Google Maps Platform...</p>
            </div>
          ) : configError || !apiKey ? (
            <div className="h-full w-full flex items-center justify-center p-8">
              <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-6 shadow-sm space-y-3">
                <div className="flex items-center gap-2.5 text-red-700">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <h2 className="font-display text-lg font-semibold text-slate-900">
                    Maps Configuration Error
                  </h2>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {configError ||
                    'No Google Maps API key was detected in the application environment.'}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ensure <code className="font-mono text-slate-700">GOOGLE_MAPS_API_KEY</code> or{' '}
                  <code className="font-mono text-slate-700">VITE_GOOGLE_MAPS_API_KEY</code> is set and restart the server.
                </p>
              </div>
            </div>
          ) : (
            <APIProvider
              apiKey={apiKey}
              libraries={['marker']}
              language="en"
              region="US"
            >
              <ExplorerMap
                activeResult={activeResult}
                activeQuery={activeQuery}
                recenterNonce={recenterNonce}
                onMapError={handleMapError}
                insights={insights}
                onRetryInsights={handleRetryInsights}
                onDismissInsights={handleDismissInsights}
              />
            </APIProvider>
          )}
        </section>
      </main>
    </div>
  );
}
