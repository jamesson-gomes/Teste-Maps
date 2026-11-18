export interface LatLngCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeViewport {
  low: LatLngCoordinates;
  high: LatLngCoordinates;
}

export interface GeocodePostalAddress {
  regionCode?: string;
  languageCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  sublocality?: string;
  addressLines?: string[];
}

export interface GeocodeAddressComponent {
  longText: string;
  shortText?: string;
  types: string[];
  languageCode?: string;
}

export interface GeocodePlusCode {
  globalCode?: string;
  compoundCode?: string;
}

export interface GeocodeResult {
  place?: string;
  placeId?: string;
  location: LatLngCoordinates;
  granularity?: string;
  viewport?: GeocodeViewport;
  formattedAddress?: string;
  postalAddress?: GeocodePostalAddress;
  addressComponents?: GeocodeAddressComponent[];
  types?: string[];
  plusCode?: GeocodePlusCode;
}

export interface GeocodeSuccessResponse {
  query: string;
  endpoint: string;
  results: GeocodeResult[];
}

export interface GeocodeErrorDetails {
  code: number;
  status: string;
  message: string;
  hint: string;
  endpoint?: string;
}

export interface LocalInsightsErrorDetails {
  code: number;
  status: string;
  message: string;
  hint: string;
}

export interface LocalInsightsState {
  locationLabel: string;
  html: string | null;
  isLoading: boolean;
  error: LocalInsightsErrorDetails | null;
}

export interface PresetDestination {
  id: string;
  label: string;
  query: string;
  regionLabel: string;
}

export const PRESET_DESTINATIONS: PresetDestination[] = [
  {
    id: 'buenos-aires',
    label: 'Buenos Aires',
    query: 'Buenos Aires, Argentina',
    regionLabel: 'Argentina',
  },
  {
    id: 'shibuya',
    label: 'Shibuya',
    query: 'Shibuya, Tokyo, Japan',
    regionLabel: 'Tokyo',
  },
  {
    id: 'copacabana',
    label: 'Copacabana',
    query: 'Copacabana, Rio de Janeiro, Brazil',
    regionLabel: 'Rio de Janeiro',
  },
  {
    id: 'cologne',
    label: 'Cologne',
    query: 'Cologne, Germany',
    regionLabel: 'Germany',
  },
  {
    id: 'lima',
    label: 'Lima',
    query: 'Lima, Peru',
    regionLabel: 'Peru',
  },
];

/**
 * Resolves a clean "City, State" (or "Neighborhood/City, Region/Country") label
 * from a Geocoding V4 response for Local Insights generation.
 */
export function extractCityStateLabel(
  result: GeocodeResult,
  fallbackQuery: string
): string | null {
  const components = result.addressComponents ?? [];

  const findComponent = (targetTypes: string[]): string | undefined => {
    for (const type of targetTypes) {
      const match = components.find((c) => c.types?.includes(type));
      if (match?.longText) return match.longText;
    }
    return undefined;
  };

  const sublocality =
    findComponent(['neighborhood', 'sublocality_level_1', 'sublocality']) ??
    result.postalAddress?.sublocality;

  const city =
    findComponent(['locality', 'postal_town', 'administrative_area_level_2']) ??
    result.postalAddress?.locality;

  const state =
    findComponent(['administrative_area_level_1']) ??
    result.postalAddress?.administrativeArea;

  const country = findComponent(['country']);

  const primaryPlace = sublocality && city && sublocality !== city ? sublocality : city || sublocality;
  const secondaryPlace =
    sublocality && city && sublocality !== city
      ? city
      : state && state !== primaryPlace
        ? state
        : country && country !== primaryPlace
          ? country
          : undefined;

  if (primaryPlace && secondaryPlace) {
    return `${primaryPlace}, ${secondaryPlace}`;
  }
  if (primaryPlace) {
    return primaryPlace;
  }
  if (state && country && state !== country) {
    return `${state}, ${country}`;
  }
  if (result.formattedAddress) {
    const parts = result.formattedAddress
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    if (parts.length === 1) return parts[0];
  }

  const trimmedFallback = fallbackQuery.trim();
  return trimmedFallback || null;
}
