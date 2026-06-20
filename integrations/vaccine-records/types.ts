// poodleOS — vaccine-record integration: shared types
//
// Provider-agnostic seam. The app talks to `VaccineRecordProvider`, never to a
// vendor directly, so VetVerifi / OCR / manual entry are swappable. Design lock
// (Sloan, 2026-06-19): vaccine status NEVER blocks a booking — it produces a
// soft flag + chase task. See ./README.md.

export type VaccineName =
  | 'rabies'
  | 'dhpp'        // distemper, hepatitis, parvo, parainfluenza
  | 'bordetella'
  | 'civ'         // canine influenza (H3N2/H3N8) — two-dose/14-day timing trap
  | 'leptospirosis'
  | 'lyme';

export type RecordSource = 'vetverifi' | 'ocr' | 'manual';

export interface VaccinationRecord {
  vaccine: VaccineName;
  administeredOn: string;        // ISO 8601 date
  expiresOn: string | null;      // null = unknown expiry (flag for follow-up)
  /** true only when from a trusted source (aggregator/vet); owner photo = false until verified */
  verified: boolean;
  source: RecordSource;
  rawDocumentUrl?: string;       // stored scan/photo for audit
  notes?: string;
}

export interface PetVaccineStatus {
  petId: string;
  records: VaccinationRecord[];
  retrievedAt: string;           // ISO 8601
  provider: string;              // provider.name that produced this
}

/**
 * Timestamped owner authorization to pull medical records from a clinic.
 * REQUIRED before any VetVerifi/clinic pull — pet records aren't HIPAA; ~35 states
 * require the owner's written consent for clinic release (see library:
 * Vet-Record-and-Vaccine-Integration.md). OCR of an owner-held photo does not
 * need this (the owner already possesses the document).
 */
export interface OwnerConsent {
  ownerId: string;
  petId: string;
  grantedAt: string;             // ISO 8601 — must be timestamped
  scope: 'vet-record-release';
  method: 'in-app-checkbox' | 'signed-form';
  revokedAt?: string | null;
}

export interface FetchInput {
  petId: string;
  consent?: OwnerConsent;        // required by clinic-pull providers, optional for OCR
  /** provider-specific hints, e.g. { documentUrl } for OCR, { clinicId } for VetVerifi */
  hints?: Record<string, unknown>;
}

export interface VaccineRecordProvider {
  readonly name: RecordSource;
  /** true if this provider has the config/credentials it needs to run */
  isConfigured(): boolean;
  /** whether this provider legally requires OwnerConsent before fetching */
  readonly requiresConsent: boolean;
  fetchRecords(input: FetchInput): Promise<PetVaccineStatus>;
}

export class ConsentRequiredError extends Error {
  constructor(public petId: string) {
    super(`Owner consent required before pulling vet records for pet ${petId}`);
    this.name = 'ConsentRequiredError';
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(public provider: string) {
    super(`Vaccine provider "${provider}" is not configured`);
    this.name = 'ProviderNotConfiguredError';
  }
}
