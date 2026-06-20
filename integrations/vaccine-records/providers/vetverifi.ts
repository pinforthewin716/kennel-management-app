// poodleOS — VetVerifi provider adapter
//
// STATUS: SHELL — pending the real VetVerifi API contract.
// VetVerifi is an aggregator that delivers VERIFIED vaccine records to pet-service
// businesses and already integrates with Gingr/PetExec (one integration → 30+ vet
// PIMS). Their API auth/endpoints/fields and partner-onboarding terms are NOT yet
// confirmed (recon in progress: library file VetVerifi-API-Integration-Recon.md).
//
// Do NOT mark this provider configured/working until the real contract is filled
// in below. Everything inside fetchRecords is a documented PLACEHOLDER, not a
// verified call. This keeps the seam ready without shipping a guessed integration.

import {
  type FetchInput,
  type PetVaccineStatus,
  type VaccineRecordProvider,
  ConsentRequiredError,
  ProviderNotConfiguredError,
} from '../types';

export interface VetVerifiConfig {
  apiKey?: string;       // from env: VETVERIFI_API_KEY (set once partner creds obtained)
  baseUrl?: string;      // CONFIRM: VetVerifi API base URL (recon)
}

export class VetVerifiProvider implements VaccineRecordProvider {
  readonly name = 'vetverifi' as const;
  readonly requiresConsent = true;

  constructor(private cfg: VetVerifiConfig = {}) {}

  isConfigured(): boolean {
    // Intentionally requires BOTH a key and a confirmed base URL. Until recon
    // fills baseUrl, this returns false and the registry falls back to OCR.
    return Boolean(this.cfg.apiKey && this.cfg.baseUrl);
  }

  async fetchRecords(input: FetchInput): Promise<PetVaccineStatus> {
    if (!this.isConfigured()) throw new ProviderNotConfiguredError(this.name);
    if (!input.consent || input.consent.revokedAt) throw new ConsentRequiredError(input.petId);

    // ── PLACEHOLDER — replace with the real, recon-confirmed VetVerifi call ──
    // Expected (to verify): authenticated request keyed by pet/owner/clinic hint,
    // returning verified vaccination entries we map into VaccinationRecord[].
    //
    //   const res = await fetch(`${this.cfg.baseUrl}/<CONFIRM_ENDPOINT>`, {
    //     headers: { Authorization: `Bearer ${this.cfg.apiKey}` },
    //     ...
    //   });
    //   return mapVetVerifiResponse(await res.json(), input.petId);
    //
    throw new Error(
      'VetVerifiProvider.fetchRecords not implemented — awaiting confirmed API contract (see recon doc).',
    );
  }
}
