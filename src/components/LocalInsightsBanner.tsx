import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Compass,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { LocalInsightsState } from '../types/geocode';

interface LocalInsightsBannerProps {
  insights: LocalInsightsState | null;
  onRetry: () => void;
  onDismiss: () => void;
}

export function LocalInsightsBanner({
  insights,
  onRetry,
  onDismiss,
}: LocalInsightsBannerProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Re-expand whenever a new location lookup starts or finishes with new content
  useEffect(() => {
    if (insights?.isLoading || insights?.html || insights?.error) {
      setIsCollapsed(false);
    }
  }, [insights?.locationLabel, insights?.isLoading]);

  if (!insights) {
    return null;
  }

  return (
    <div className="absolute bottom-7 left-3 right-14 sm:left-5 sm:right-16 z-10 pointer-events-none flex justify-center">
      <section
        aria-label="Local Insights"
        className="pointer-events-auto w-full max-w-2xl bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-lg overflow-hidden"
      >
        {/* Banner Header */}
        <div
          className={`px-4 py-3 sm:px-5 flex items-center justify-between gap-3 ${
            !isCollapsed ? 'border-b border-slate-200/80' : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Compass
              className="w-4 h-4 text-blue-700 shrink-0"
              aria-hidden="true"
            />
            <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 whitespace-nowrap shrink-0">
              Local Insights
            </h2>
            <span className="text-slate-300 shrink-0" aria-hidden="true">
              ·
            </span>
            <span className="text-xs sm:text-sm font-medium text-blue-700 truncate">
              {insights.locationLabel}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!insights.isLoading && (
              <button
                type="button"
                onClick={onRetry}
                aria-label="Refresh local insights"
                title="Refresh local insights"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              aria-label={
                isCollapsed ? 'Expand local insights' : 'Minimize local insights'
              }
              aria-expanded={!isCollapsed}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              {isCollapsed ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close local insights"
              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Banner Body */}
        {!isCollapsed && (
          <div className="px-4 py-3.5 sm:px-5 sm:py-4 max-h-56 overflow-y-auto">
            {insights.isLoading ? (
              <div
                className="flex items-center gap-3 py-1 text-slate-600"
                role="status"
                aria-live="polite"
              >
                <Loader2
                  className="w-4 h-4 animate-spin text-blue-700 shrink-0"
                  aria-hidden="true"
                />
                <p className="text-xs sm:text-sm">
                  Curating 3 local facts for{' '}
                  <span className="font-medium text-slate-900">
                    {insights.locationLabel}
                  </span>
                  ...
                </p>
              </div>
            ) : insights.error ? (
              <div
                role="alert"
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-50/80 border border-red-200 rounded-lg p-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertCircle
                    className="w-4 h-4 text-red-700 mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-semibold text-red-950">
                      Unable to load Local Insights ({insights.error.status})
                    </p>
                    <p className="text-xs text-red-800 leading-relaxed">
                      {insights.error.message} {insights.error.hint}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Try again
                </button>
              </div>
            ) : insights.html ? (
              <div
                className="local-insights-list"
                dangerouslySetInnerHTML={{ __html: insights.html }}
              />
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
