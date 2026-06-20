# Vaccine-record connection point

Provider-agnostic seam for getting a dog's vaccination records into poodleOS.
The app calls `getVaccineStatus(providers, input)` and `evaluateVaccineStatus(...)`;
it never talks to a vendor directly.

## Design locks (Sloan, 2026-06-19)

- **Booking is never blocked.** Expired/missing/unverified vaccines produce a
  *soft flag* + a staff **chase task** (remind the owner, pull from the vet, or
  schedule a vet trip). `evaluateVaccineStatus().bookingAllowed` is always `true`.
- **Two-track retrieval:** VetVerifi aggregator (automated, many clinics) with
  **OCR of an owner photo** as the universal fallback that needs no integration.

## Providers

| Provider | Automation | Consent needed | Status |
|----------|-----------|----------------|--------|
| `VetVerifiProvider` | Auto pull, 30+ vet PIMS | **Yes** (clinic release) | **SHELL** — awaiting confirmed API contract (see recon doc) |
| `OcrProvider` | Owner photo → OCR | No (owner holds doc) | Interface ready; inject an `OcrEngine` (AWS Textract / Google Document AI) |

## Legal

Pet records aren't HIPAA. ~35 states require the **owner's written, timestamped
consent** before a clinic releases records — enforced by `OwnerConsent` and the
`requiresConsent` flag. OCR sidesteps clinic-release law (the owner already holds
the certificate). Source: poodleOS library `Vet-Record-and-Vaccine-Integration.md`.

## Wiring (once VetVerifi creds + the real contract land)

```ts
const providers = defaultProviders({
  vetVerifiApiKey: process.env.VETVERIFI_API_KEY,
  vetVerifiBaseUrl: process.env.VETVERIFI_BASE_URL, // CONFIRM via recon
  ocrEngine: myTextractEngine,                      // implements OcrEngine
});
const status = await getVaccineStatus(providers, { petId, consent, hints: { documentUrl } });
const evalResult = evaluateVaccineStatus(status, ['rabies', 'dhpp', 'bordetella']);
// evalResult.chaseList → create reminder/chase tasks; booking proceeds regardless
```

## TODO (blocked on VetVerifi recon)

- Fill `VetVerifiProvider.fetchRecords` with the confirmed endpoint/auth/response map.
- Confirm partner-onboarding path + commercial terms (vendor call).
