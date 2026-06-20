# VetVerifi Partner API — application (ready to file)

**Gate:** VetVerifi's API is partner-gated. Apply at **vetverifi.com/api-access**
(or email **hello@vetverifi.com** / call **(615) 434-6805**, Nashville TN).
Approval quoted ~2 business days, after which we receive the real auth + record schema.

**Action needed from Sloan:** this is outward-facing (discloses business info + starts
a vendor relationship) — review the answers below and either submit the form
yourself, or say "send it" and I'll file via the browser.

## Draft answers

| Field | Answer |
|-------|--------|
| Company / product | poodleOS (Happy Pup Manor) — kennel-management software |
| Platform type | Boarding / daycare / grooming management SaaS (Gingr replacement) |
| Primary use case | Verify dog vaccine compliance at booking & check-in; surface soft flags, never block bookings |
| Integration intent | `POST /verify` + `GET /verify/refresh` at check-in; webhook for status changes |
| Scale (initial) | Single facility (Happy Pup Manor, Grayslake IL) → multi-tenant product roadmap |
| Tech stack | Next.js + TypeScript, Supabase (Postgres), Vercel |
| Contact | Sloan — sloang85@gmail.com (or express@HappyPupManor.com) |
| Volume estimate | Low at launch (one facility); growth as product onboards other kennels |

## Confirm during onboarding (open questions from recon)

1. Exact auth header format (bearer assumed) + the real base URL (we used `api.vetverifi.com/v1`, inferred).
2. The normalized **record field schema** for `POST /verify` (only the status enum Verified/Pending/Expired is public).
3. **Consent capture** — does VetVerifi/clinic obtain the owner's record-release authorization, or must poodleOS capture it? (State vet-confidentiality law — material.)
4. Pricing: "location-based + usage-based"; confirm the free tier and per-verify cost.
5. Webhook signature/verification scheme for `POST /webhooks/vetverifi`.

## Parallel track (no gate)

Prototype the data model now against **Vetspire's public self-serve GraphQL API**
(`api.vetspire.com/graphql`, self-issued key, `ImmunizationQueries`) — single PIMS,
but lets us build/test the real record→flag flow while the VetVerifi app is pending.
