-- poodleOS — core schema (MVP spine)
-- Owners, pets, vaccinations (+ consent + soft-flag), reservations, runs,
-- services, invoices, staff, and vaccine chase tasks.
--
-- DESIGN LOCK (Sloan, 2026-06-19): vaccine status NEVER blocks a reservation.
-- An expired/missing vaccine creates a chase task; the booking still confirms.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────
create type vaccine_name as enum ('rabies','dhpp','bordetella','civ','leptospirosis','lyme');
create type record_source as enum ('vetverifi','ocr','manual');
create type reservation_kind as enum ('boarding','daycare','grooming');
create type reservation_status as enum ('requested','confirmed','checked_in','checked_out','canceled');
create type vaccine_flag as enum ('ok','expiring_soon','expired','missing','unverified');
create type chase_status as enum ('open','reminded','scheduled_vet','resolved','waived');
create type invoice_status as enum ('draft','open','paid','void');

-- ── People & pets ────────────────────────────────────────────────────────────
create table owners (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text not null,
  email        text,
  phone        text,
  address      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table pets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references owners(id) on delete cascade,
  name         text not null,
  breed        text,
  birthdate    date,
  weight_lb    numeric(6,2),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on pets (owner_id);

-- ── Consent (state vet-confidentiality law: timestamped owner authorization) ──
create table owner_consents (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references owners(id) on delete cascade,
  pet_id       uuid not null references pets(id) on delete cascade,
  scope        text not null default 'vet-record-release',
  method       text not null check (method in ('in-app-checkbox','signed-form')),
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz
);
create index on owner_consents (pet_id) where revoked_at is null;

-- ── Vaccinations (soft-flag source data) ─────────────────────────────────────
create table vaccinations (
  id               uuid primary key default gen_random_uuid(),
  pet_id           uuid not null references pets(id) on delete cascade,
  vaccine          vaccine_name not null,
  administered_on  date,
  expires_on       date,                 -- null = unknown expiry (flag for follow-up)
  verified         boolean not null default false,  -- true only from trusted source
  source           record_source not null,
  raw_document_url text,
  created_at       timestamptz not null default now()
);
create index on vaccinations (pet_id, vaccine);

-- ── Facility: runs (lodging units) & services ────────────────────────────────
create table runs (
  id           uuid primary key default gen_random_uuid(),
  label        text not null unique,     -- e.g. "Suite 3", "Kennel B2"
  capacity     int not null default 1,
  active       boolean not null default true
);

create table services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  kind         reservation_kind not null,
  base_price   numeric(10,2) not null,
  active       boolean not null default true
);

-- ── Staff ────────────────────────────────────────────────────────────────────
create table staff (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  role         text not null,            -- kennel_tech, daycare_attendant, groomer, front_desk, manager
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ── Reservations (booking spine — never blocked by vaccine state) ────────────
create table reservations (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references owners(id),
  service_id   uuid not null references services(id),
  run_id       uuid references runs(id),
  kind         reservation_kind not null,
  status       reservation_status not null default 'requested',
  start_at     timestamptz not null,
  end_at       timestamptz not null,
  created_at   timestamptz not null default now(),
  check (end_at > start_at)
);
create index on reservations (start_at, end_at);

-- multi-pet per reservation
create table reservation_pets (
  reservation_id uuid not null references reservations(id) on delete cascade,
  pet_id         uuid not null references pets(id),
  primary key (reservation_id, pet_id)
);

-- ── Vaccine chase tasks (the flag-and-chase workflow) ────────────────────────
create table vaccine_chase_tasks (
  id              uuid primary key default gen_random_uuid(),
  pet_id          uuid not null references pets(id) on delete cascade,
  reservation_id  uuid references reservations(id) on delete set null,
  vaccine         vaccine_name not null,
  flag            vaccine_flag not null,
  status          chase_status not null default 'open',
  assigned_to     uuid references staff(id),
  due_at          timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on vaccine_chase_tasks (status) where status <> 'resolved';

-- ── Billing ──────────────────────────────────────────────────────────────────
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references owners(id),
  reservation_id  uuid references reservations(id) on delete set null,
  status          invoice_status not null default 'draft',
  total           numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  description  text not null,
  quantity     numeric(10,2) not null default 1,
  unit_price   numeric(10,2) not null,
  amount       numeric(10,2) generated always as (quantity * unit_price) stored
);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  amount       numeric(10,2) not null,
  processor    text not null default 'stripe',
  processor_ref text,
  paid_at      timestamptz not null default now()
);

-- updated_at touch trigger
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_owners_touch before update on owners for each row execute function touch_updated_at();
create trigger t_pets_touch before update on pets for each row execute function touch_updated_at();
create trigger t_chase_touch before update on vaccine_chase_tasks for each row execute function touch_updated_at();
