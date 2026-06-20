import { describe, it, expect } from 'vitest';
import {
  evaluateVaccineStatus,
  resolveProvider,
  OcrProvider,
  VetVerifiProvider,
  type OcrEngine,
  type OwnerConsent,
  type PetVaccineStatus,
  type VaccinationRecord,
} from '../index';

const consent: OwnerConsent = {
  ownerId: 'o1',
  petId: 'p1',
  grantedAt: '2026-06-19T00:00:00Z',
  scope: 'vet-record-release',
  method: 'in-app-checkbox',
};

function status(records: VaccinationRecord[]): PetVaccineStatus {
  return { petId: 'p1', records, retrievedAt: '2026-06-19T00:00:00Z', provider: 'test' };
}

describe('evaluateVaccineStatus (soft-flag, never blocks booking)', () => {
  const now = new Date('2026-06-19T00:00:00Z');

  it('flags a missing required vaccine but still allows booking', () => {
    const r = evaluateVaccineStatus(status([]), ['rabies'], { now });
    expect(r.perVaccine.rabies).toBe('missing');
    expect(r.chaseList).toContain('rabies');
    expect(r.bookingAllowed).toBe(true);
  });

  it('flags an expired vaccine', () => {
    const r = evaluateVaccineStatus(
      status([{ vaccine: 'rabies', administeredOn: '2024-01-01', expiresOn: '2025-01-01', verified: true, source: 'vetverifi' }]),
      ['rabies'],
      { now },
    );
    expect(r.perVaccine.rabies).toBe('expired');
    expect(r.bookingAllowed).toBe(true);
  });

  it('flags expiring_soon inside the window', () => {
    const r = evaluateVaccineStatus(
      status([{ vaccine: 'rabies', administeredOn: '2025-07-10', expiresOn: '2026-07-10', verified: true, source: 'vetverifi' }]),
      ['rabies'],
      { now, expiringWindowDays: 30 },
    );
    expect(r.perVaccine.rabies).toBe('expiring_soon');
  });

  it('marks an owner-supplied (unverified) record as unverified', () => {
    const r = evaluateVaccineStatus(
      status([{ vaccine: 'rabies', administeredOn: '2026-01-01', expiresOn: '2027-01-01', verified: false, source: 'ocr' }]),
      ['rabies'],
      { now },
    );
    expect(r.perVaccine.rabies).toBe('unverified');
    expect(r.chaseList).toContain('rabies');
  });

  it('passes a current, verified vaccine', () => {
    const r = evaluateVaccineStatus(
      status([{ vaccine: 'rabies', administeredOn: '2026-01-01', expiresOn: '2027-01-01', verified: true, source: 'vetverifi' }]),
      ['rabies'],
      { now },
    );
    expect(r.perVaccine.rabies).toBe('ok');
    expect(r.chaseList).toHaveLength(0);
  });
});

describe('resolveProvider (VetVerifi → OCR fallback)', () => {
  const fakeEngine: OcrEngine = { extract: async () => [] };

  it('falls back to OCR when VetVerifi is unconfigured', () => {
    const providers = [new VetVerifiProvider({}), new OcrProvider(fakeEngine)];
    const p = resolveProvider(providers, { hasConsent: true });
    expect(p?.name).toBe('ocr');
  });

  it('prefers VetVerifi when configured and consent is present', () => {
    const providers = [new VetVerifiProvider({ apiKey: 'k' }), new OcrProvider(fakeEngine)];
    expect(resolveProvider(providers, { hasConsent: true })?.name).toBe('vetverifi');
  });

  it('skips VetVerifi (consent-required) when no consent, uses OCR', () => {
    const providers = [new VetVerifiProvider({ apiKey: 'k' }), new OcrProvider(fakeEngine)];
    expect(resolveProvider(providers, { hasConsent: false })?.name).toBe('ocr');
  });
});

describe('OcrProvider', () => {
  it('tags extracted records as ocr/unverified and needs no consent', async () => {
    const engine: OcrEngine = {
      extract: async () => [{ vaccine: 'rabies', administeredOn: '2026-01-01', expiresOn: '2027-01-01', verified: true, source: 'manual' }],
    };
    const provider = new OcrProvider(engine);
    expect(provider.requiresConsent).toBe(false);
    const res = await provider.fetchRecords({ petId: 'p1', hints: { documentUrl: 'https://x/scan.jpg' } });
    expect(res.records[0]?.source).toBe('ocr');
    expect(res.records[0]?.verified).toBe(false);
    expect(res.records[0]?.rawDocumentUrl).toBe('https://x/scan.jpg');
  });

  it('rejects a clinic-pull without consent (VetVerifi)', async () => {
    const provider = new VetVerifiProvider({ apiKey: 'k', baseUrl: 'https://api.vetverifi.com/v1' });
    await expect(provider.fetchRecords({ petId: 'p1' })).rejects.toThrow(/consent/i);
  });
});

void consent;
