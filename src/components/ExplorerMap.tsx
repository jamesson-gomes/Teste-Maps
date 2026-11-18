import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMapView,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { AlertTriangle, Crosshair, Layers, RotateCcw } from 'lucide-react';
import type { GeocodeResult, LocalInsightsState } from '../types/geocode';
import { LocalInsightsBanner } from './LocalInsightsBanner';

type MapLayerType = 'roadmap' | 'satellite' | 'terrain';

interface ExplorerMapProps {
  activeResult: GeocodeResult | null;
  activeQuery: string;
  recenterNonce: number;
  onMapError: (message: string) => void;
  insights: LocalInsightsState | null;
  onRetryInsights: () => void;
  onDismissInsights: () => void;
}

const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 18.0, lng: -15.0 };
const DEFAULT_ZOOM = 2.4;

function formatCoord(value: number, posHemisphere: string, negHemisphere: string): string {
  const hemisphere = value >= 0 ? posHemisphere : negHemisphere;
  return `${Math.abs(value).toFixed(5)}° ${hemisphere}`;
}

function getMarkerLabel(result: GeocodeResult, fallbackQuery: string): string {
  const locality = result.postalAddress?.locality;
  const admin = result.postalAddress?.administrativeArea;
  if (locality) return locality;
  if (admin) return admin;
  if (result.formattedAddress) {
    return result.formattedAddress.split(',')[0].trim();
  }
  return fallbackQuery;
}

export function ExplorerMap({
  activeResult,
  activeQuery,
  recenterNonce,
  onMapError,
  insights,
  onRetryInsights,
  onDismissInsights,
}: ExplorerMapProps) {
  const map = useMap();
  const apiStatus = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(false);
  const [mapType, setMapType] = useState<MapLayerType>('roadmap');
  const [isUserPanned, setIsUserPanned] = useState(false);

  const markerPosition = useMemo<google.maps.LatLngLiteral | null>(() => {
    if (!activeResult?.location) return null;
    return {
      lat: activeResult.location.latitude,
      lng: activeResult.location.longitude,
    };
  }, [activeResult]);

  // Report Maps JS SDK loading/auth errors upstream for troubleshooting
  useEffect(() => {
    if (apiStatus === APILoadingStatus.AUTH_FAILURE) {
      onMapError(
        'Google Maps JavaScript API authentication failed. Verify that your API key is valid and enabled for Maps JavaScript API.'
      );
    } else if (apiStatus === APILoadingStatus.FAILED) {
      onMapError(
        'Unable to load the Google Maps JavaScript API script. Check your network connection or browser blockers.'
      );
    }
  }, [apiStatus, onMapError]);

  // Pan and fit bounds whenever a new geocoded result is selected or recenter is requested
  useEffect(() => {
    if (!map || !activeResult?.location) return;

    const targetLatLng = {
      lat: activeResult.location.latitude,
      lng: activeResult.location.longitude,
    };

    if (activeResult.viewport?.low && activeResult.viewport?.high) {
      const bounds: google.maps.LatLngBoundsLiteral = {
        south: activeResult.viewport.low.latitude,
        west: activeResult.viewport.low.longitude,
        north: activeResult.viewport.high.latitude,
        east: activeResult.viewport.high.longitude,
      };
      map.panTo(targetLatLng);
      map.fitBounds(bounds, { top: 72, right: 64, bottom: 160, left: 64 });

      const idleListener = map.addListener('idle', () => {
        const currentZoom = map.getZoom();
        if (typeof currentZoom === 'number' && currentZoom > 17) {
          map.setZoom(17);
        }
        idleListener.remove();
      });

      setIsUserPanned(false);
      setInfoOpen(false);
      return () => {
        idleListener.remove();
      };
    } else {
      map.panTo(targetLatLng);
      map.setZoom(14);
      setIsUserPanned(false);
      setInfoOpen(false);
    }
  }, [map, activeResult, recenterNonce]);

  const handleRecenter = useCallback(() => {
    if (!map || !activeResult?.location) return;
    const targetLatLng = {
      lat: activeResult.location.latitude,
      lng: activeResult.location.longitude,
    };
    if (activeResult.viewport?.low && activeResult.viewport?.high) {
      map.fitBounds(
        {
          south: activeResult.viewport.low.latitude,
          west: activeResult.viewport.low.longitude,
          north: activeResult.viewport.high.latitude,
          east: activeResult.viewport.high.longitude,
        },
        { top: 72, right: 64, bottom: 160, left: 64 }
      );
    } else {
      map.panTo(targetLatLng);
      map.setZoom(14);
    }
    setIsUserPanned(false);
  }, [map, activeResult]);

  const handleResetWorld = useCallback(() => {
    if (!map) return;
    map.panTo(DEFAULT_CENTER);
    map.setZoom(DEFAULT_ZOOM);
    setInfoOpen(false);
  }, [map]);

  const handleDragStart = useCallback(() => {
    if (activeResult) {
      setIsUserPanned(true);
    }
  }, [activeResult]);

  const markerLabel = activeResult ? getMarkerLabel(activeResult, activeQuery) : '';

  if (apiStatus === APILoadingStatus.AUTH_FAILURE || apiStatus === APILoadingStatus.FAILED) {
    return (
      <div className="relative h-full w-full bg-slate-100 flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-2.5 text-red-700 mb-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Map Unavailable
            </h2>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Google Maps JavaScript API could not initialize ({apiStatus}). Review the error panel on the left for API key and billing diagnostics.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload Map
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-slate-100">
      {/* Top-right map layer & camera utility controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center justify-end gap-2">
        <div
          className="inline-flex items-center bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg p-1 shadow-sm"
          role="group"
          aria-label="Map layer style"
        >
          <span className="px-2 text-slate-400" aria-hidden="true">
            <Layers className="w-3.5 h-3.5" />
          </span>
          {(['roadmap', 'satellite', 'terrain'] as const).map((layer) => {
            const isSelected = mapType === layer;
            return (
              <button
                key={layer}
                type="button"
                onClick={() => setMapType(layer)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 capitalize cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {layer === 'roadmap' ? 'Map' : layer}
              </button>
            );
          })}
        </div>

        {activeResult && (
          <button
            type="button"
            onClick={handleRecenter}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isUserPanned
                ? 'bg-blue-700 text-white border-blue-700 hover:bg-blue-800'
                : 'bg-white/95 backdrop-blur-sm text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="Re-center map on selected marker"
          >
            <Crosshair className="w-3.5 h-3.5" />
            Re-center
          </button>
        )}

        {activeResult && (
          <button
            type="button"
            onClick={handleResetWorld}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm text-slate-700 hover:bg-slate-50 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Zoom out to global view"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            World View
          </button>
        )}
      </div>

      {/* Interactive Google Map container (explicit 100% height parent) */}
      <GoogleMapView
        mapId="DEMO_MAP_ID"
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={DEFAULT_ZOOM}
        gestureHandling="greedy"
        mapTypeId={mapType}
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={true}
        fullscreenControl={false}
        zoomControl={true}
        onDragstart={handleDragStart}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        {markerPosition && activeResult && (
          <>
            <AdvancedMarker
              ref={markerRef}
              position={markerPosition}
              anchorPoint={AdvancedMarkerAnchorPoint.BOTTOM}
              title={activeResult.formattedAddress || markerLabel}
              onClick={() => setInfoOpen((prev) => !prev)}
            >
              <div className="group flex flex-col items-center cursor-pointer select-none">
                {/* Editorial marker callout label */}
                <div className="mb-2 px-3 py-1.5 bg-slate-950 text-white rounded-md shadow-md border border-white/15 flex items-center gap-2 transition-transform duration-150 group-hover:-translate-y-0.5">
                  <span className="text-xs font-semibold tracking-tight whitespace-nowrap max-w-[200px] truncate">
                    {markerLabel}
                  </span>
                </div>

                {/* Precision architectural crosshair beacon */}
                <div className="relative flex items-center justify-center w-9 h-9">
                  <div className="absolute inset-0 rounded-full bg-blue-700/20 border border-blue-700/40 transition-transform duration-200 group-hover:scale-110" />
                  <div className="relative w-4 h-4 rounded-full bg-blue-700 border-[2.5px] border-white shadow-md" />
                </div>

                {/* Vertical anchor stem */}
                <div className="w-px h-2.5 bg-slate-900" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
              </div>
            </AdvancedMarker>

            {infoOpen && marker && (
              <InfoWindow
                anchor={marker}
                pixelOffset={[0, -6]}
                maxWidth={280}
                onCloseClick={() => setInfoOpen(false)}
              >
                <div className="p-1 font-sans text-slate-900">
                  <p className="font-display text-sm font-semibold text-slate-900 leading-snug mb-1">
                    {markerLabel}
                  </p>
                  {activeResult.formattedAddress && (
                    <p className="text-xs text-slate-600 leading-relaxed mb-2">
                      {activeResult.formattedAddress}
                    </p>
                  )}
                  <div className="pt-2 border-t border-slate-200 font-mono text-[11px] text-slate-500 tabular-nums space-y-0.5">
                    <div>
                      {formatCoord(markerPosition.lat, 'N', 'S')} ·{' '}
                      {formatCoord(markerPosition.lng, 'E', 'W')}
                    </div>
                    {activeResult.plusCode?.globalCode && (
                      <div>Plus Code: {activeResult.plusCode.globalCode}</div>
                    )}
                  </div>
                </div>
              </InfoWindow>
            )}
          </>
        )}
      </GoogleMapView>

      {/* Bottom-of-map Local Insights Banner */}
      <LocalInsightsBanner
        insights={insights}
        onRetry={onRetryInsights}
        onDismiss={onDismissInsights}
      />
    </div>
  );
}
