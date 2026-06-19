# Kennel Management App — Feature Parity & Data Model (Gingr + Zoho Replacement)

Build-oriented spec for the Happy Pup Manor custom kennel-management platform that will REPLACE Gingr (operations) and Zoho (CRM/Bookings/Invoice). Every Gingr/Zoho capability below was verified against the vendors' own feature pages (June 2026); features not confirmed on an official page are flagged as such. This doc feeds an actual software build — entities, fields, and roadmap are concrete.

---

## 1. Gingr Feature Inventory (verified capabilities the replacement must match)

Gingr is a cloud platform for boarding, daycare, grooming, training, and dog-park businesses. Confirmed capabilities, grouped by the module the new app must build:

**Online booking & reservation calendar**
- Self-service online booking through a branded client portal/landing page; requests route into the system for staff approval.
- Drag-and-drop scheduling calendars; "real-time availability management" — once a service/lodging hits capacity it shows "unavailable" to clients automatically.
- Multiple service types managed in one account: lodging/boarding, daycare groups, grooming appointments, multi-session training classes.

**Customer & pet profiles**
- Customer (owner) profiles and "customizable pet profiles" holding images, vaccination details, belongings, incident report cards, and full reservation/booking history.
- Staff can pull up vaccinations, belongings, and photos quickly and add services/retail items onto an existing reservation.

**Vaccination records + expiry hard-block** (a core differentiator — must replicate exactly)
- Vaccination uploads can be made MANDATORY in the client portal.
- Gingr automatically BLOCKS reservation requests when a pet's required vaccinations are expired or missing. This is a hard gate, not a warning — the data model must support per-species required-vaccine rules and an enforced expiry check at booking time.

**Check-in / check-out**
- "Gingr PreCheck" — flight-style online/self-serve check-in plus curbside check-in to cut wait time and surface upsells.
- Automatic "I'm here!" / "I'm here" curbside-arrival notifications.
- Multi-pet, multi-owner batch check-in.

**Lodging / run assignment & capacity**
- Lodging calendar shows which kennels/runs are occupied vs. available.
- Facility-specific capacity limits enforced automatically across lodging and daycare.

**Daycare grouping**
- Daycare "groups" for managing dogs by play group.

**Retail / POS**
- Integrated Point of Sale; selling an item decrements inventory automatically ("Retail management features" for inventory tracking).

**Packages & memberships**
- Sell packages (e.g., daycare passes) and "flexible memberships and recurring reservations."
- Membership management: track renewals, loyalty/perks programs. (Loyalty-program depth noted in third-party reviews, not a primary Gingr page — flag as verify-at-build.)

**Automated communications (email / SMS / reminders)**
- "Automated email and SMS reminders," appointment reminders, and report-card/photo-video sends to pet parents.

**Deposits & cancellation policy**
- "Secure cards-on-file and deposit collections"; deposits collectible at booking.
- Cancellation policy: implied by deposits/cards-on-file but NOT explicitly documented on the pages fetched — treat cancellation/no-show fee rules as a build requirement to design, validating exact Gingr behavior at build time.

**Automated pricing rules**
- Automatic price adjustments for early check-in, late checkout, weight, and age — pricing rules engine, not manual line edits.

**Reporting / occupancy**
- "Business Analytics": period-by-period comparative reports, multi-location data, booking-source insights, financial/analytical reports, occupancy via the lodging calendar.

**Employee scheduling & time clock**
- Staff scheduling, time-clock tracking, daily checklists, to-do lists, hours-worked tracking and reservation report printing.

**Customer portal / app + payments**
- Pet-parent mobile app (iOS/Android): book appointments, view invoices, pay balances, receive report cards.
- Integrated payment processor with cards-on-file; POS for in-facility sales.

---

## 2. Zoho Pieces in Use — What Each Contributes (so the custom build absorbs them)

The custom app must absorb these so Zoho can be dropped entirely:

**Zoho CRM** — contact/owner records, lead capture, deal/pipeline tracking (Kanban stages), workflow automation (triggered emails, task assignment, field updates on stage change), assignment rules, and Zia AI (deal/lead scoring, best-time-to-contact). *Absorb as:* the Customer entity + a lightweight lead/inquiry pipeline + automation rules. The kennel app likely does NOT need full sales-CRM depth — a lead status field + automated follow-up email covers most of it. Flag Zia/AI scoring as out-of-scope for MVP.

**Zoho Bookings** — appointment scheduling: share availability, client self-books a slot, per-staff/per-workspace calendars, scheduling rules (locations, meeting types, availability windows), automated reminders, and upfront payment collection. *Absorb as:* the Reservation + Service + availability/capacity engine. This overlaps heavily with Gingr booking — build ONE booking engine, not two.

**Zoho Invoice / Books** — professional branded invoices, recurring invoices, scheduled invoices, payment reminders on due dates, online payment gateways (credit/debit/net-banking), multi-currency, progress/retainer invoices, credit notes (returns/refunds), customer statements, sales orders, and approval workflows. *Absorb as:* the Invoice + Payment entities + a recurring-billing job + accounting export. Retainer/progress invoicing maps cleanly to deposits and package pre-pay.

**Zoho email campaigns / Campaigns** (if in use) — marketing email blasts and sequences. *Absorb as:* a simple broadcast-email feature OR keep an external ESP (Mailchimp/Klaviyo) integration. Recommend NOT rebuilding campaign tooling in MVP — integrate instead.

---

## 3. Proposed Data Model (replacement core schema)

PostgreSQL/Supabase-style. Surrogate `id` (uuid) PK on every table unless noted. `created_at`/`updated_at` timestamps assumed on all. `→` denotes FK.

**Customer** (owner) — absorbs Zoho CRM contact
- id, first_name, last_name, email (unique), phone, address fields, notes
- lead_status (enum: lead, active, inactive, churned), source (booking_source / referral)
- stripe_customer_id, card_on_file_token, marketing_opt_in (bool)
- balance_cents (derived/cached)
- Relationships: 1—N Pet, 1—N Reservation, 1—N Invoice, 1—N Payment

**Pet**
- id, customer_id →Customer, name, species (enum: dog, cat, other), breed, sex, spayed_neutered (bool), birthdate, weight_lbs, color
- photo_url, feeding_notes, medical_notes, behavior_flags (jsonb/array), belongings (text)
- Relationships: N—1 Customer; 1—N Vaccination; 1—N Reservation (via ReservationPet); 1—N IncidentReport

**Vaccination** — drives the expiry hard-block
- id, pet_id →Pet, vaccine_type (enum: rabies, dhpp, bordetella, ...), administered_date, expiry_date
- document_url (uploaded proof), verified_by_staff_id →Staff, status (enum: valid, expired, missing, pending_review)
- Rule table **VaccineRequirement**: id, species, vaccine_type, required (bool) — defines what each species must have. Booking engine joins Pet→Vaccination against VaccineRequirement and blocks if any required vaccine is missing/expired as of reservation start date.

**Reservation** — the booking; absorbs Gingr reservation + Zoho Bookings appointment
- id, customer_id →Customer, service_id →Service, status (enum: requested, confirmed, checked_in, checked_out, cancelled, no_show)
- start_at, end_at (datetime; boarding = multi-day, daycare/grooming = intraday)
- run_id →Run (nullable; lodging only), daycare_group_id →DaycareGroup (nullable)
- deposit_cents, deposit_paid (bool), price_cents (computed via pricing rules), cancellation_policy_id →CancellationPolicy
- checked_in_at, checked_out_at, source (online_portal, staff, app)
- **ReservationPet** join (N—N): reservation_id, pet_id, add_ons (jsonb) — supports multi-pet reservations
- Relationships: N—1 Customer, N—1 Service, N—1 Run, 1—1/N Invoice

**Run / Kennel** (lodging unit)
- id, name/number, run_type (enum: standard, suite, cat_condo), capacity (int, usually 1), location_id (multi-location), status (enum: available, occupied, maintenance, blocked)
- Occupancy is computed from overlapping confirmed Reservations, not a stored flag (avoids drift).

**Service**
- id, name, category (enum: boarding, daycare, grooming, training, retail), base_price_cents, duration, requires_run (bool), capacity_per_slot
- **PricingRule** child: id, service_id, rule_type (early_checkin, late_checkout, weight_tier, age_tier, peak_date), condition (jsonb), adjustment_cents/percent — replicates Gingr auto-pricing.

**Package / Membership**
- id, name, type (enum: package, membership), service_id →Service (what it applies to)
- For package: credits_total (e.g., 10 daycare days), price_cents
- For membership: billing_interval (monthly/annual), recurring_price_cents, perks (jsonb)
- **CustomerPackage** (purchased instance): id, customer_id, package_id, credits_remaining, status, renews_at, stripe_subscription_id

**Invoice** — absorbs Zoho Invoice/Books
- id, customer_id →Customer, reservation_id →Reservation (nullable), invoice_number (sequential), status (enum: draft, sent, paid, partial, void, overdue)
- subtotal_cents, tax_cents, total_cents, amount_paid_cents, balance_cents, due_date, is_recurring (bool), recurring_template_id
- **InvoiceLineItem** child: id, invoice_id, description, qty, unit_price_cents, line_total_cents, service_id/package_id ref

**Payment**
- id, customer_id →Customer, invoice_id →Invoice (nullable for deposits/credit), amount_cents, method (enum: card, cash, ach, account_credit), stripe_payment_intent_id, status (enum: succeeded, refunded, failed), processed_at
- Supports deposits (invoice-less), refunds (negative/linked), and account credit.

**Staff**
- id, name, email, role (enum: admin, manager, staff), pin (time-clock), hourly_rate_cents, active (bool)
- Relationships: 1—N Shift, 1—N TimeClockEntry

**Shift / Schedule**
- id, staff_id →Staff, start_at, end_at, role/position, location_id
- **TimeClockEntry**: id, staff_id, clock_in_at, clock_out_at, hours (computed) — separate from scheduled Shift (scheduled vs. actual).

**Supporting entities**
- **DaycareGroup**: id, name, capacity, date, location_id
- **IncidentReport / ReportCard**: id, pet_id, reservation_id, staff_id, type, notes, media_urls, sent_to_customer (bool)
- **CancellationPolicy**: id, name, window_hours, fee_type (flat/percent/deposit_forfeit), fee_value
- **RetailProduct + InventoryCount**: id, name, sku, price_cents, qty_on_hand — POS decrements on sale.
- **CommunicationLog**: id, customer_id, channel (email/sms), template, sent_at, status — audit of automated comms.

**Key relationship summary**
- Customer 1—N Pet 1—N Vaccination (gated by VaccineRequirement)
- Customer 1—N Reservation N—N Pet (ReservationPet); Reservation N—1 Run, N—1 Service
- Reservation 1—N Invoice 1—N Payment; Invoice 1—N InvoiceLineItem
- Customer 1—N CustomerPackage N—1 Package/Membership
- Staff 1—N Shift / TimeClockEntry

---

## 4. Prioritized Module Roadmap

**MVP (Phase 1) — operational core; replaces Gingr day-one ops + Zoho Invoice**
1. Customer + Pet profiles (CRUD, photos, notes).
2. Vaccination records WITH the expiry hard-block at booking (non-negotiable — it's the legal/liability gate).
3. Reservation + reservation calendar: boarding + daycare, run/kennel assignment, capacity enforcement.
4. Check-in / check-out flow (incl. multi-pet batch).
5. Invoicing + Payments: generate invoice from reservation, take card payment, deposits, cards-on-file.
- *Integration points for MVP:* Stripe (payments/cards-on-file/deposits), an email/SMS provider (Postmark/SendGrid + Twilio) for booking confirmations and reminders.

**Phase 2 — self-service & retention**
6. Customer portal / pet-parent app: self-service booking requests (with vax gate), view/pay invoices, report cards.
7. Automated communications engine: booking confirmations, reminders, vax-expiry warnings, "I'm here" arrival.
8. Packages & memberships + recurring billing (Stripe subscriptions).
9. Automated pricing rules (early/late, weight, age, peak).

**Phase 3 — back-office & growth**
10. Reporting & occupancy dashboards (period comparisons, booking-source, revenue).
11. Staff scheduling + time clock.
12. Retail/POS + inventory.
13. Grooming + training service types; daycare group management UI.
- *Integration points:* accounting export (QuickBooks/Zoho Books CSV or API) so bookkeeping survives the cutover; optional marketing-email ESP rather than rebuilding campaigns.

**Cross-cutting integration points**
- Payments: Stripe (Connect if multi-location).
- Email/SMS: transactional ESP + Twilio.
- Accounting: export to QuickBooks/Zoho Books (don't rebuild GL).
- Calendar: optional Google Calendar sync for staff (replaces a Zoho Bookings nicety).

---

## 5. Migration Considerations (Gingr + Zoho → new app)

**Export formats**
- Gingr: no public bulk-export API documented; expect CSV exports of customers, pets, reservations, and reports via the admin UI, plus possible support-assisted data dump. Confirm available export endpoints/CSVs with Gingr support early — this is the long-pole risk. Vaccination documents (uploaded files) may need manual/bulk file retrieval.
- Zoho CRM/Books/Bookings: all support CSV export and have REST APIs (Zoho CRM Bulk Read API, Books API). Prefer API pulls for clean field mapping; CSV as fallback.

**Import order (dependency-driven)**
1. **Customers** first (everything FKs to them) — dedupe by email; merge Zoho CRM contact + Gingr owner into one Customer row.
2. **Pets** (FK Customer) — match to owner by email/phone.
3. **Vaccinations** (FK Pet) — CRITICAL: import administered/expiry dates AND the proof documents; re-run the requirement check post-import so the booking gate is accurate from day one. Flag any pet with missing/expired required vax before go-live.
4. **Services / Runs / Packages** — configuration data; set up before reservations so FKs resolve.
5. **Open/future Reservations** — import only confirmed future + recent-history reservations; map to runs/services.
6. **Invoices / Payments** — import open balances and recent history; reconcile against Zoho Books for cash-basis continuity. Historical paid invoices can be archived rather than fully migrated.
7. **Staff / schedules** — lowest dependency; can follow.

**Cutover cautions**
- Run new + old in parallel for one boarding cycle; reconcile occupancy and balances before killing Gingr.
- The vaccination hard-block must be verified against real data before opening online booking — a missed expiry import = a non-compliant booking accepted.
- Preserve invoice numbering continuity (or document the reset point) for bookkeeping/tax.
- Confirm card-on-file portability: Stripe tokens are NOT transferable from Gingr's processor — customers will likely need to re-enter cards, or use a Stripe-supported card migration. Plan a re-collection flow.

*Source: https://www.gingrapp.com/, https://www.gingrapp.com/solutions, https://gingrapp.com/solutions/boarding, https://www.gingrapp.com/kennel-software, https://www.gingrapp.com/dog-daycare-software, https://www.gingrapp.com/pet-scheduling-software, https://www.gingrapp.com/enterprise, https://www.softwareadvice.com/pet-grooming/gingr-profile/, https://www.getapp.com/industries-software/a/gingr/, https://www.zoho.com/bookings/features/, https://www.zoho.com/us/books/accounting-software/invoice-management/, https://www.zoho.com/us/invoice/features/, retrieved 2026-06-19*
