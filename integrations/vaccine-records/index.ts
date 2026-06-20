// poodleOS — vaccine-record connection point (public entry)
//
// One place the app calls. Resolves the best available provider (VetVerifi when
// configured + consent on file, else OCR fallback) and evaluates status into a
// SOFT FLAG. Booking is NEVER blocked — expired/missing vaccines create a flag +
// a staff chase task (remind owner, pull from vet, or schedule a vet trip).

import { OcrProvider } from './providers/ocr';
import { VetVerifiProvider } from './providers/vetverifi';
import {
  type FetchInput,
  type OwnerConsent,
  type PetVaccineStatus,
  type VaccineName,
  type VaccineRecordProvider,
} from './types';

export * from './types';
export { OcrProvider } from './providers/ocr';
export { VetVerifiProvider } from './providers/vetverifi';

/** Pick the most-automated provider that's actually usable for this request. */
export function resolveProvider(
  providers: VaccineRecordProvider[],
  ctx: { hasConsent: boolean },
): VaccineRecordProvider | undefined {
  // Prefer a configured clinic-pull provider when consent exists; else first
  // configured no-consent provider (OCR). Order of `providers` = preference.
  const usable = providers.filter((p) => p.isConfigured());
  return (
    usable.find((p) => p.requiresConsent && ctx.hasConsent) ??
    usable.find((p) => !p.requiresConsent)
  );
}

export async function getVaccineStatus(
  providers: VaccineRecordProvider[],
  input: FetchInput,
): Promise<PetVaccineStatus | null> {
  const provider = resolveProvider(providers, { hasConsent: Boolean(input.consent && !input.consent.revokedAt) });
  if (!provider) return null;       // nothing usable yet — caller flags "no vax on file"
  return provider.fetchRecords(input);
}

// ── Soft-flag evaluation ─────────────────────────────────────────────────────

export type VaccineFlag = 'ok' | 'expiring_soon' | 'expired' | 'missing' | 'unverified';

export interface VaccineEvaluation {
  petId: string;
  perVaccine: Record<string, VaccineFlag>;
  /** vaccines needing staff action (expired/missing/expiring/unverified) */
  chaseList: VaccineName[];
  /** DESIGN LOCK: always true. Vaccine state never blocks a reservation. */
  bookingAllowed: true;
}

export function evaluateVaccineStatus(
  status: PetVaccineStatus | null,
  required: VaccineName[],
  opts: { now?: Date; expiringWindowDays?: number } = {},
): VaccineEvaluation {
  const now = opts.now ?? new Date();
  const windowMs = (opts.expiringWindowDays ?? 30) * 86_400_000;
  const perVaccine: Record<string, VaccineFlag> = {};
  const chaseList: VaccineName[] = [];

  for (const vac of required) {
    const rec = status?.records.find((r) => r.vaccine === vac);
    let flag: VaccineFlag;
    if (!rec) flag = 'missing';
    else if (rec.expiresOn && new Date(rec.expiresOn).getTime() < now.getTime()) flag = 'expired';
    else if (rec.expiresOn && new Date(rec.expiresOn).getTime() - now.getTime() < windowMs) flag = 'expiring_soon';
    else if (!rec.verified) flag = 'unverified';
    else flag = 'ok';

    perVaccine[vac] = flag;
    if (flag !== 'ok') chaseList.push(vac);
  }

  return { petId: status?.petId ?? '', perVaccine, chaseList, bookingAllowed: true };
}

/** Convenience factory wiring the default two-track stack (VetVerifi → OCR). */
export function defaultProviders(env: {
  vetVerifiApiKey?: string;
  vetVerifiBaseUrl?: string;
  ocrEngine?: ConstructorParameters<typeof OcrProvider>[0];
}): VaccineRecordProvider[] {
  return [
    new VetVerifiProvider({ apiKey: env.vetVerifiApiKey, baseUrl: env.vetVerifiBaseUrl }),
    new OcrProvider(env.ocrEngine),
  ];
}

export type { OwnerConsent };
