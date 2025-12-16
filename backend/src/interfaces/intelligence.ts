// Layer 2: Intelligence / inference-layer types
// These types may contain derived fields and should NOT be exposed on public registry APIs.

import type { CanonicalEventIdentity } from './registry';

export type PresenceMethod =
  | 'gps'
  | 'wifi'
  | 'cell'
  | 'bluetooth'
  | 'qr'
  | 'nfc'
  | 'manual'
  | 'other';

/**
 * Coarse dwell buckets used for aggregation while limiting precision.
 */
export type DwellBand =
  | 'unknown'
  | 'lt_5m'
  | '5_15m'
  | '15_30m'
  | '30_60m'
  | '1_2h'
  | '2_4h'
  | 'gt_4h';

export type PresenceProof = {
  method: PresenceMethod;
  /** When the signal/proof was captured (ISO 8601). */
  capturedAt: string;
  /** Optional coarse confidence (0..1). */
  confidence?: number;
  /** Optional vendor/source identifier (device/app/provider). */
  source?: string;
  /** Arbitrary method-specific evidence payload (kept internal). */
  evidence?: Record<string, unknown>;
};

export type AttendanceRecord = {
  identity: CanonicalEventIdentity;
  /** Internal participant identifier (not public). */
  personId: string;

  /** Attendance window (ISO 8601). */
  arrivedAt?: string;
  departedAt?: string;

  dwellBand: DwellBand;

  proofs?: PresenceProof[];

  /** Aggregated attendance score (0..1) used for ranking/analytics. */
  attendanceScore?: number;
};

export type FeedbackAnswers = {
  /** NPS-style rating (0..10) */
  rating?: number;
  /** Optional freeform text */
  comment?: string;

  /** Structured questionnaire answers */
  answers?: Record<string, string | number | boolean | null>;
};

export type FeedbackRecord = {
  identity: CanonicalEventIdentity;
  personId: string;

  submittedAt: string;
  answers: FeedbackAnswers;
};

export type BrokerageInsightsResponse = {
  identity: CanonicalEventIdentity;

  /**
   * Insights are derived/aggregated intelligence intended for internal tooling
   * (or privileged partner APIs).
   */
  attendance?: {
    estimatedAttendees?: number;
    uniqueDevicesObserved?: number;
    avgDwellBand?: DwellBand;
  };

  sentiment?: {
    avgRating?: number;
    nResponses?: number;
    topThemes?: string[];
  };

  /** Diagnostics and internal metadata */
  generatedAt: string;
  modelVersion?: string;
};
