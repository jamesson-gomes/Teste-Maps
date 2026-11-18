import { type FormEvent, useState } from 'react';
import {
  AlertCircle,
  Check,
  Compass,
  Copy,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import {
  PRESET_DESTINATIONS,
  type GeocodeErrorDetails,
  type GeocodeResult,
  type PresetDestination,
} from '../types/geocode';

export interface HistoryEntry {
  query: string;
  label: string;
  result: GeocodeResult;
}

interface EditorialPanelProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: (searchQuery: string) => void;
  onSelectPreset: (preset: PresetDestination) => void;
  isLoading: boolean;
  activePresetId: string | null;
  activeQuery: string;
  results: GeocodeResult[];
  selectedResultIndex: number;
  onSelectResultIndex: (index: number) => void;
  error: GeocodeErrorDetails | null;
  onDismissError: () => void;
  onRetry: () => void;
  history: HistoryEntry[];
  onSelectHistory: (entry: HistoryEntry) => void;
}

function formatGranularity(granularity?: string): string {
  if (!granularity) return 'Standard';
  return granularity
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatPlaceTypes(types?: string[]): string {
  if (!types || types.length === 0) return 'Geographic feature';
  return types
    .slice(0, 4)
    .map((t) =>
      t
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    )
    .join(' · ');
}

function getLocationHeading(result: GeocodeResult, fallbackQuery: string): string {
  const locality = result.postalAddress?.locality;
  const admin = result.postalAddress?.administrativeArea;
  if (locality && admin && locality !== admin) {
    return `${locality}, ${admin}`;
  }
  if (locality) return locality;
  if (result.formattedAddress) {
    return result.formattedAddress.split(',')[0].trim();
  }
  return fallbackQuery;
}

function formatLocalitySummary(result: GeocodeResult): string | null {
  const parts = [
    result.postalAddress?.sublocality,
    result.postalAddress?.locality,
    result.postalAddress?.administrativeArea,
    result.postalAddress?.regionCode,
  ].filter((part): part is string => Boolean(part));

  const uniqueParts = parts.filter((item, idx) => parts.indexOf(item) === idx);
  return uniqueParts.length > 0 ? uniqueParts.join(' · ') : null;
}

export function EditorialPanel({
  query,
  onQueryChange,
  onSearchSubmit,
  onSelectPreset,
  isLoading,
  activePresetId,
  activeQuery,
  results,
  selectedResultIndex,
  onSelectResultIndex,
  error,
  onDismissError,
  onRetry,
  history,
  onSelectHistory,
}: EditorialPanelProps) {
  const [copiedCoords, setCopiedCoords] = useState(false);

  const activeResult = results[selectedResultIndex] ?? null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearchSubmit(query);
  };

  const handleCopyCoords = async () => {
    if (!activeResult?.location) return;
    const text = `${activeResult.location.latitude.toFixed(6)}, ${activeResult.location.longitude.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 1800);
    } catch {
      // Clipboard API unavailable in restricted contexts
    }
  };

  const localitySummary = activeResult ? formatLocalitySummary(activeResult) : null;

  return (
    <aside className="w-full lg:w-1/3 lg:min-w-[360px] lg:max-w-[520px] lg:h-full flex flex-col bg-white border-b lg:border-b-0 lg:border-r border-slate-200 lg:overflow-y-auto">
      {/* Masthead */}
      <header className="px-6 pt-6 pb-5 sm:px-8 border-b border-slate-200">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="font-display text-2xl sm:text-[28px] font-semibold tracking-tight text-slate-900 whitespace-nowrap">
            Block Explorer
          </h1>
          <span className="text-xs font-mono text-slate-500 whitespace-nowrap shrink-0">
            Geocoding V4
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
          Search any city, neighborhood, or street block to resolve coordinates and frame it on the map.
        </p>
      </header>

      {/* Search & Presets Workspace */}
      <div className="px-6 py-6 sm:px-8 space-y-6 flex-1">
        {/* Search Form */}
        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="location-search"
            className="block text-xs font-semibold text-slate-700 mb-2"
          >
            Search location
          </label>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="location-search"
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="City, neighborhood, or address..."
                autoComplete="off"
                className="w-full h-11 pl-10 pr-9 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 transition-colors"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => onQueryChange('')}
                  aria-label="Clear search query"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="h-11 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Locating</span>
                </>
              ) : (
                <span>Explore</span>
              )}
            </button>
          </div>
        </form>

        {/* Five Featured Presets */}
        <section aria-labelledby="presets-heading">
          <div className="flex items-center justify-between mb-2.5">
            <h2 id="presets-heading" className="text-xs font-semibold text-slate-700">
              Featured destinations
            </h2>
            <span className="text-xs text-slate-400">5 presets</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESET_DESTINATIONS.map((preset) => {
              const isActive = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onSelectPreset(preset)}
                  className={`min-h-[40px] px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                    isActive
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Clear Troubleshooting Error Panel */}
        {error && (
          <section
            role="alert"
            aria-live="assertive"
            className="border border-red-200 bg-red-50/80 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-950">
                    Geocoding Request Failed
                  </h3>
                  <p className="text-xs font-mono text-red-800 mt-0.5 tabular-nums">
                    {error.status}
                    {error.code > 0 ? ` · HTTP ${error.code}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss error"
                className="p-1 text-red-700 hover:text-red-950 rounded cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-red-900 leading-relaxed">{error.message}</p>

            <div className="pt-2.5 border-t border-red-200/80 space-y-1.5">
              <p className="text-xs font-medium text-red-950">Troubleshooting</p>
              <p className="text-xs text-red-800 leading-relaxed">{error.hint}</p>
              {error.endpoint && (
                <p className="text-[11px] font-mono text-red-700 break-all">
                  Endpoint: {error.endpoint}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onRetry}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry lookup
              </button>
              <button
                type="button"
                onClick={onDismissError}
                className="px-3 py-1.5 text-xs font-medium text-red-800 hover:text-red-950 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        {/* Active Geocoded Spatial Dossier */}
        {activeResult ? (
          <section
            aria-label="Selected location details"
            className="pt-6 border-t border-slate-200 space-y-5"
          >
            <div>
              {localitySummary && (
                <p className="text-xs text-slate-500 mb-1.5">{localitySummary}</p>
              )}
              <h2 className="font-display text-2xl font-semibold text-slate-900 leading-tight text-balance">
                {getLocationHeading(activeResult, activeQuery)}
              </h2>
              {activeResult.formattedAddress && (
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  {activeResult.formattedAddress}
                </p>
              )}
            </div>

            {/* Multiple match switcher if Geocoding V4 returns multiple results */}
            {results.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500 mr-1">
                  {results.length} matches:
                </span>
                {results.slice(0, 4).map((res, idx) => (
                  <button
                    key={res.placeId || idx}
                    type="button"
                    onClick={() => onSelectResultIndex(idx)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      idx === selectedResultIndex
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    Match {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Coordinates Readout */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold text-slate-700">
                  Resolved coordinates
                </span>
                <button
                  type="button"
                  onClick={handleCopyCoords}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedCoords ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">Latitude</div>
                  <div className="font-mono text-sm font-medium text-slate-900 tabular-nums">
                    {activeResult.location.latitude.toFixed(6)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 mb-0.5">Longitude</div>
                  <div className="font-mono text-sm font-medium text-slate-900 tabular-nums">
                    {activeResult.location.longitude.toFixed(6)}
                  </div>
                </div>
              </div>
            </div>

            {/* Structured Spatial Metadata */}
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 flex items-baseline justify-between gap-4">
                <dt className="text-slate-500 shrink-0">Precision</dt>
                <dd className="font-medium text-slate-900 text-right">
                  {formatGranularity(activeResult.granularity)}
                </dd>
              </div>
              <div className="py-2.5 flex items-baseline justify-between gap-4">
                <dt className="text-slate-500 shrink-0">Classification</dt>
                <dd className="text-slate-700 text-right">
                  {formatPlaceTypes(activeResult.types)}
                </dd>
              </div>
              {activeResult.plusCode?.globalCode && (
                <div className="py-2.5 flex items-baseline justify-between gap-4">
                  <dt className="text-slate-500 shrink-0">Plus Code</dt>
                  <dd className="font-mono text-slate-900 tabular-nums text-right">
                    {activeResult.plusCode.globalCode}
                  </dd>
                </div>
              )}
              {activeResult.placeId && (
                <div className="py-2.5 flex items-baseline justify-between gap-4">
                  <dt className="text-slate-500 shrink-0">Place ID</dt>
                  <dd
                    className="font-mono text-slate-700 truncate max-w-[220px] text-right"
                    title={activeResult.placeId}
                  >
                    {activeResult.placeId}
                  </dd>
                </div>
              )}
              {activeResult.viewport?.low && activeResult.viewport?.high && (
                <div className="py-2.5 flex items-baseline justify-between gap-4">
                  <dt className="text-slate-500 shrink-0">Viewport span</dt>
                  <dd className="font-mono text-[11px] text-slate-700 tabular-nums text-right">
                    {activeResult.viewport.low.latitude.toFixed(3)},{' '}
                    {activeResult.viewport.low.longitude.toFixed(3)} →{' '}
                    {activeResult.viewport.high.latitude.toFixed(3)},{' '}
                    {activeResult.viewport.high.longitude.toFixed(3)}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        ) : (
          !error && (
            <section className="pt-6 border-t border-slate-200">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-slate-800">
                  <Compass className="w-4 h-4 text-blue-700 shrink-0" />
                  <h2 className="text-sm font-semibold">Ready to explore</h2>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Enter any neighborhood, city, or street address above—or select one of the five preset destinations—to query the Google Geocoding V4 endpoint and frame the block on the map.
                </p>
              </div>
            </section>
          )
        )}

        {/* Session History */}
        {history.length > 1 && (
          <section className="pt-5 border-t border-slate-200 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-700">Recent lookups</h3>
            <ul className="divide-y divide-slate-100">
              {history.map((item, idx) => (
                <li key={`${item.query}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => onSelectHistory(item)}
                    className="w-full py-2 flex items-center justify-between gap-3 text-left hover:bg-slate-50 rounded px-1.5 -mx-1.5 transition-colors cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-800 truncate">
                        {item.label}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {item.result.location.latitude.toFixed(2)},{' '}
                      {item.result.location.longitude.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Quiet Editorial Footer */}
      <footer className="px-6 py-4 sm:px-8 border-t border-slate-200 bg-slate-50/70">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Block Explorer · Powered by Google Maps Platform &amp; Geocoding API v4
        </p>
      </footer>
    </aside>
  );
}
