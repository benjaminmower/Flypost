// Layer 1: Public Registry DTOs
// These types must remain free of inference/intelligence fields.
// They may be safely exposed via public APIs.

export type CanonicalEventIdentity = {
  /** Canonical (stable) event identifier used across systems. */
  eventId: string;
  /** Entity/organization owning the event within the platform. */
  organizerId?: string;
};

export type GeoPoint = {
  /** Latitude in decimal degrees. */
  lat: number;
  /** Longitude in decimal degrees. */
  lng: number;
  /** Optional accuracy in meters (when known). */
  accuracyM?: number;
};

/**
 * Strict public event DTO: registry facts only.
 * No derived/intelligence fields should be added here.
 */
export type RegistryEventPublic = {
  identity: CanonicalEventIdentity;

  /** Human-friendly event title. */
  title: string;
  /** Optional short description suitable for public listing. */
  description?: string;

  /** Event start/end times (ISO 8601). */
  startsAt: string;
  endsAt?: string;

  /** Optional venue/location information. */
  location?: {
    name?: string;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    geo?: GeoPoint;
  };

  /** Publicly visible metadata */
  tags?: string[];
  /** Optional canonical URL for the public detail page. */
  publicUrl?: string;
};

export type PublicDiscoveryResponse = {
  /** Server time (ISO 8601) at the time of response. */
  generatedAt: string;
  /** Events safe for public discovery surfaces. */
  events: RegistryEventPublic[];
  /** Pagination cursor/continuation token (if applicable). */
  nextCursor?: string;
};
