// poodleOS — VetVerifi provider adapter
//
// VetVerifi is a partner-gated aggregator that delivers VERIFIED vaccine records
// pulled directly from SmartTag-enrolled vet clinics' PIMS (NOT owner uploads —
// that's the OCR provider's job). Endpoints below are CONFIRMED from VetVerifi's
// docs; the response FIELD SCHEMA and exact auth-header format are behind the
// partner gate and arrive after onboarding (apply at vetverifi.com/api-access,
// ~2 business days). See library: VetVerifi-API-Integration-Recon.md.
//
// STATUS: endpoints wired; response→record mapping is TODO until partner creds +
// schema land. isConfigured() stays false until an API key is set, so the
// registry falls back to OCR in the meantime.

import {
  type FetchInput,
  type PetVaccineStatus,
  type VaccinationRecord,
  type VaccineRecordProvider,
  ConsentRequiredError,
  ProviderNotConfiguredError,
} from '../types';

/** VetVerifi's public verification status enum (CONFIRMED). */
export type VetVerifiStatus = 'Verified' | 'Pending' | 'Expired';

export interface VetVerifiConfig {
  apiKey?: string;                 // env: VETVERIFI_API_KEY (issued after partner approval)
  baseUrl?: string;                // default below is INFERRED — confirm at onboarding
  fetchImpl?: typeof fetch;        // injectable for tests
}

const DEFAULT_BASE_URL = 'https://api.vetverifi.com/v1'; // INFERRED from docs copy

export class VetVerifiProvider implements VaccineRecordProvider {
  readonly name = 'vetverifi' as const;
  readonly requiresConsent = true; // clinic record-release; owner authorization mediated by VetVerifi/clinic — confirm capture at onboarding

  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(private cfg: VetVerifiConfig = {}) {
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
    this.doFetch = cfg.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.apiKey);
  }

  private headers(): Record<string, string> {
    // CONFIRM exact scheme at onboarding (bearer assumed from "drop your API key" docs).
    return { Authorization: `Bearer ${this.cfg.apiKey}`, 'Content-Type': 'application/json' };
  }

  /** POST /verify — run a verification for a pet (CONFIRMED endpoint). */
  async fetchRecords(input: FetchInput): Promise<PetVaccineStatus> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.name);
    if (!input.consent || input.consent.revokedAt) throw new ConsentRequiredError(input.petId);

    const res = await this.doFetch(`${this.baseUrl}/verify`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ petId: input.petId, ...input.hints }), // CONFIRM request body fields
    });
    if (!res.ok) throw new Error(`VetVerifi /verify failed: ${res.status} ${res.statusText}`);
    return mapVerifyResponse(await res.json(), input.petId);
  }

  /** GET /verify/refresh — re-check at check-in (CONFIRMED endpoint). */
  async refresh(petId: string): Promise<PetVaccineStatus> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.name);
    const res = await this.doFetch(`${this.baseUrl}/verify/refresh?petId=${encodeURIComponent(petId)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`VetVerifi /verify/refresh failed: ${res.status}`);
    return mapVerifyResponse(await res.json(), petId);
  }
}

/**
 * Map VetVerifi's verification status to our enum. The per-vaccine record FIELD
 * SHAPE is gated (UNKNOWN until onboarding) — only the top-level status enum is
 * public, so we surface status now and fill `records` once the schema is confirmed.
 */
export function mapVerifyResponse(raw: unknown, petId: string): PetVaccineStatus {
  const status = (raw as { status?: VetVerifiStatus })?.status;
  // TODO(partner-schema): map raw.records[] → VaccinationRecord[] once VetVerifi
  // provides the normalized record schema after partner approval.
  const records: VaccinationRecord[] = [];
  return {
    petId,
    records,
    retrievedAt: new Date().toISOString(),
    provider: status ? `vetverifi:${status}` : 'vetverifi',
  };
}
