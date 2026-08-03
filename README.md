# Drone Operations Platform

An enterprise platform for commercial drone service operations. Customers who need aerial work — farmers, FPOs, government bodies, industrial sites — find and book the businesses that own drones and crews, and those businesses run their operations on the same system.

**This is not a flight management system.** The drone is one asset inside a business; the platform runs the business.

Two product lines share one platform:

| | |
|---|---|
| **Marketplace** | discovery → booking → scheduling → completion → settlement → reputation |
| **Field Service** | drone registry → fault reporting → engineer dispatch → repair → return to service |

---

## Running it

**Prerequisites:** Node ≥ 20.11, PostgreSQL ≥ 14, npm.

```bash
npm install
createdb drone_ops_dev

cp apps/api/.env.example apps/api/.env      # then set DATABASE_URL and JWT_ACCESS_SECRET
cp apps/web/.env.example apps/web/.env.local

npm run api:build && npm --prefix apps/api run db:migrate
npm run api:seed

npm run api:dev     # http://localhost:3000  ·  docs at /api/docs
npm run web:dev     # http://localhost:3010
```

Generate a signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Customer (institution) | `fpo@demo.local` | `demo-passphrase-2026` |
| Customer (individual) | `rajaiah@demo.local` | `demo-passphrase-2026` |
| Provider | `kisan@demo.local` | `demo-passphrase-2026` |
| Platform admin | `admin@droneops.local` | `seed-admin-passphrase` |
| Service engineer | `engineer@droneops.local` | `seed-engineer-passphrase` |

Each role lands on its own surface: customers on `/bookings`, providers on `/provider/onboarding`, staff on `/admin/providers`.

### Commands

```bash
npm test              # 50 unit tests, ~3s
npm run typecheck     # both workspaces
npm run api:seed      # idempotent — safe to re-run
```

---

## Architecture

```
apps/
  api/    NestJS · PostgreSQL · Prisma
  web/    Next.js · React · Tailwind
```

### Domain modules

Each owns its own tables. No module reads or writes another's data — cross-module access goes through the owning module's **exported service**, and Nest enforces it: a provider absent from a module's `exports` cannot be injected elsewhere.

| Module | Owns | Does not own |
|---|---|---|
| **identity** | users, memberships, sessions, the permission map | business profiles |
| **organisations** | organisations, provider onboarding pipeline | login, offerings |
| **catalogue** | service types, geographic areas | prices |
| **offerings** | a provider's priced, versioned commitments | what a service *is* |
| **discovery** | matching a requirement to offerings | any writes |
| **bookings** | the job, its assignments, schedules, history | whether it was paid |
| **settlement** | payment *records* | moving money |
| **reputation** | reviews, derived ratings | bookings |
| **assets** | drones | who flies them |
| **field-service** | maintenance tickets | drones themselves |

Supporting capabilities: **documents** (storage + signed access), **notifications** (event listener), plus logging, config and Prisma under `infrastructure/`.

### Layers

```
Controller   HTTP surface: route, guards, DTOs.       No business logic.
Service      Business rules, transactions, events.    No SQL.
Repository   Prisma queries.                          No rules.
```

### Two rules that shape everything

**1. Dependencies point one way, and are declared.**

```
identity ← everything (authorisation)
catalogue ← offerings ← discovery
organisations ← offerings, assets, bookings
bookings ← settlement, reputation
assets ← field-service

notifications → listens to events, imported by nothing
```

There are no cycles. Nest throws at boot if one appears.

**2. Admin is a surface, not a module.**

`modules/admin/` contains **controllers and nothing else** — no service, no repository. Every admin action calls the exported service of the module that owns the data. A new domain module therefore ships *with* its admin surface instead of being retrofitted into a god module.

---

## Decision log

The reasoning behind choices a reader would otherwise have to reverse-engineer.

### Identity is not a `role` column

`users` (who you are) · `organisations` (who the customer is) · `memberships` (what you may do there).

A `users.role` enum cannot express two requirements the product actually has: staff booking **on behalf of** a farmer, and institutions like FPOs where several people share one account. Permissions derive from **(organisation kind × membership role)**, so the same person can be an owner of their own farm and a field officer at a co-operative.

Every write records both an **actor** (who clicked) and a **principal** (whose behalf).

### Authorisation has two levels, deliberately

| | Question | Where |
|---|---|---|
| **Level 1** | Can this *role* ever do this? | A guard, from a static map |
| **Level 2** | Can this *user* do it to *this record*? | The service, using `ActorContext` |

Guards stay stateless and never touch the database. A guard that loads domain data drags business knowledge into the HTTP layer and can't be unit-tested without a request.

Routes are **protected by default** — `JwtAuthGuard` is registered globally and `@Public()` opts out. The failure mode inverts: forgetting to open a route gives you a broken endpoint you notice, not an open one you don't.

### Prices are versioned and immutable

An `Offering` is stable identity; an `OfferingVersion` is an immutable priced commitment. Repricing **closes** the current version and **opens** a new one — nothing is ever updated.

A booking references a *version*, so a quoted price cannot move retroactively. This replaces a `unit_price_snapshot` column and generalises: inclusions, minimum quantity and pricing unit are frozen by the same mechanism.

**What's included** — chemical, water, transport, labour, fuel — is part of the priced version. In drone spraying that's the single largest source of real-world disputes; making it part of the agreement means it is settled before booking rather than argued about in a field.

### Assignment is a table, not a column

A rejected booking returns to `UNASSIGNED` carrying its requirement, timeline and history, and can be offered to someone else. With a `provider_id` column there would be nothing to return to — you'd null it and lose the fact that anyone declined.

The `strategy` column (`CUSTOMER_CHOICE` today) is populated from day one so automatic assignment is a new enum value, not a migration of live data.

### Invariants live in the database where they can be raced

Application-level `if (exists) throw` is check-then-act: two concurrent requests both read nothing and both write. Four partial unique indexes are hand-written in migrations because Prisma's schema language cannot express them:

```sql
booking_assignments (booking_id)  WHERE status IN ('PENDING','ACCEPTED')
offering_versions   (offering_id) WHERE effective_to IS NULL
offerings (provider_id, service_type_id) WHERE status = 'ACTIVE'
booking_schedules   (booking_id)  WHERE status = 'PENDING'
```

Plus optimistic locking (`version` column on bookings) and check constraints on ratings and amounts. The application check exists for a friendly message; **the constraint is the guarantee.**

### State machines, declared once

Four lifecycles — booking, provider onboarding, maintenance ticket, schedule — each with an explicit transition table and recorded history. Never scattered `if (status === …)`.

Adding `DOCUMENTS_SUBMITTED` to the onboarding pipeline touched three lines in one file and nothing else.

### Scheduling is separate from the booking lifecycle

Booking status tracks the *job* (6 states); schedule status tracks the *date* (4 states). Folding a negotiation into the job's machine is how a six-state machine becomes a twenty-state machine. Either party proposes; the **other** confirms.

Dates are a **local calendar date plus a named window** (`DAWN`, `MORNING`…), never a UTC instant. A provider committing to "Thursday morning" is not committing to 06:00:00, and inventing that precision generates disputes.

### The platform records payment, it does not move it

Money goes directly customer → provider. The module is called **Settlement**, not Payments, to stop that boundary eroding.

Consequence, stated plainly: **the platform cannot verify a payment claim.** Either party records it, both see who did, and disagreement is a future dispute flow. Money is always an integer in minor units — never a float, at any layer.

### Notifications are a listener, not a call

No domain module imports `NotificationsModule`. Booking emits `booking.rejected` and knows nothing about who cares. Email in future is a new subscriber, not a change to any service.

Events are emitted **after** the transaction commits — a listener that threw inside it would roll back the booking. The cost is honest: a crash between commit and emit loses the event. Closing that gap needs a transactional outbox, deferred deliberately (see below).

### Storage is an interface with a swappable adapter

Development writes to local disk; production uses S3-compatible object storage. The client flow is identical in both — request a signed URL, `PUT` the bytes, confirm — so only the *host* differs. In production the file never passes through the API.

Uploaded filenames are **never** used to build a path. Only the extension survives; the path is `prefix/ownerId/uuid`.

---

## Business rules and where they are enforced

| | Rule | Enforced by |
|---|---|---|
| BR1 | Only an activated provider is bookable | Discovery query + service check |
| BR2 | At most one active assignment per booking | **Partial unique index** |
| BR3 | Only the assigned provider may answer | Service (level 2) |
| BR4 | Rejection returns the booking to unassigned | State machine |
| BR5 | Provider completes; customer confirms | **Permission map** |
| BR6 | Payment only against completed work | Service |
| BR7 | One review, by the customer, after completion | **Unique index** + permission map |
| BR8 | A quoted price never changes | Immutable offering version |
| BR9 | Cancellation is terminal | State machine |
| BR11 | A ticket cannot close without a report | Service |
| BR13 | A provider must serve the area | Query + service |
| BR14 | Final amount comes from what was delivered | Service |
| BR15 | The proposer cannot confirm their own date | Service |
| BR16 | Every transition records actor, time, reason | Repository (same transaction) |
| BR17 | A provider cannot book their own services | Permission map + service |

---

## Testing

```bash
npm test                 # 50 unit tests, ~3s — no database
npm run api:test:int     # 27 integration tests, ~5s — real Postgres
```

**Two suites, deliberately separate.** Mixing them makes the fast one slow and stops it being run on every save.

**Unit** — pure functions and services with mocked repositories. Every dependency is injected, so a test hands the service whatever it likes. *A service that constructed its own `PrismaClient` could only be tested with Postgres running*; that is the practical case for dependency injection. Covers the permission map (including deny-by-default for unassigned role combinations), all four state machines, and service-layer validation.

**Integration** — real database, real transactions, real indexes, against a separate `drone_ops_test` database that is truncated between tests. Covers what mocks provably cannot:

| | |
|---|---|
| **BR2** | Two *simultaneous* `assign()` calls produce exactly one winner |
| **BR8** | Repricing an offering by 40% leaves an existing booking's quote untouched |
| **BR14** | 20 booked, 18 delivered → 18 billed |
| **BR16** | A failed transition writes **no** history row |
| **BR6/BR7** | Unique indexes refuse a second payment or review |
| **BR11** | A ticket cannot close without a *confirmed* report |
| — | Check constraints reject a rating of 9 written directly via SQL |
| — | Two simultaneous cancels leave exactly one cancellation |

Setup:

```bash
createdb drone_ops_test
DATABASE_URL="postgresql://USER@localhost:5432/drone_ops_test" npx --prefix apps/api prisma migrate deploy
```

---

## Deliberately not built

Each of these is a real pattern, correctly applied elsewhere, and wrong at this scale. Knowing why is the point.

| | Why not |
|---|---|
| **Microservices** | No team boundary to enforce, no independent scaling need. Buys distributed transactions and a deployment problem |
| **Event sourcing** | Fits a booking lifecycle — and costs projections, replay and versioning. Append-only status history gives most of the audit value for a fraction of the cost |
| **CQRS** | Justified by read/write asymmetry that does not exist here |
| **Transactional outbox** | The only current event consumer is a notification bell, where loss is cosmetic. Build it the moment an event drives money, an SLA clock, or a second system |
| **Rules engine** | Seventeen business rules need seventeen tested methods, not a DSL |
| **Policy engine (OPA/Casbin)** | Four roles. Revisit if per-resource rules multiply |
| **GraphQL** | Solves over-fetching across many clients. There is one |
| **Multi-tenancy** | Single operator. Adding it speculatively taxes every query forever |
| **Caching layer** | No measured hot path. Caching before measuring introduces correctness bugs for imaginary gains |

## Known limitations

Stated rather than hidden.

- **Payment is self-reported.** The platform never sees the money and cannot verify a claim.
- **Discovery sorts in memory.** Price lives on a related row. Free at tens of offerings per area; the fix at scale is a denormalised current-price column, not yet needed.
- **Notification read state is per-organisation.** One member marking read hides it for all. Wrong once organisations really have several members; the fix is a per-user read table.
- **Events are not durable.** A crash between commit and emit loses one. See the outbox note above.
- **Upload size is client-asserted.** The server should verify with a `HEAD` against storage before trusting it.
- **Local disk storage is development only.** Managed hosting has an ephemeral filesystem; uploads would vanish on redeploy.

## Design documents

| | |
|---|---|
| `docs/architecture/aggregates-and-invariants.md` | Which objects change together, and what must be true afterwards |

---

## Deployment shape

Frontend on a serverless host; **API on a long-running server** — NestJS builds a DI container at boot and fights serverless on every axis. PostgreSQL managed; files on S3-compatible storage. Migrations run on deploy, never by hand.
