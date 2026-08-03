# Aggregates and Invariants

What must be true after every operation, and which cluster of objects is responsible for keeping it true.

This is the contract every service in the codebase is written against. Read it before adding a module.

---

## Why this document exists

A schema tells you what can be *stored*. It does not tell you what must be *true*. Those are different questions, and only the second one prevents bugs.

An **aggregate** is a group of objects that must change together to stay correct. Inside one, consistency is immediate and enforced in a single database transaction. Across two, consistency is *eventual* — one changes, an event fires, the other catches up.

Getting this wrong produces two failure modes:

- **Boundaries too small** → invariants span aggregates, so nothing can enforce them, and you get corrupt data (two active assignments on one booking).
- **Boundaries too large** → every write locks half the database, and unrelated features block each other.

---

## Rules

1. **One transaction per aggregate, per operation.** Never write to two aggregate roots in one transaction.
2. **Reference other aggregates by ID only.** Never load another aggregate to mutate it.
3. **Invariants inside an aggregate are enforced in the service layer, and — where they can be raced — also by a database constraint.** Application-level `if (exists) throw` is check-then-act and loses under concurrency.
4. **Cross-aggregate consistency is eventual, via domain events.** If that is unacceptable for some rule, the boundary is drawn wrong.

---

### Documented exception: account provisioning

Registration creates a **User**, an **Organisation** and a **Membership** in one transaction — two aggregate roots, which rule 1 forbids.

This is deliberate. Neither record is meaningful alone, there is no intermediate state a user could legitimately observe, and splitting it would require compensating logic for partial failure to solve a problem that does not exist within a single database.

The exception holds only while both live in the same database. If Identity ever became a separate service, this becomes a saga.

**No other operation may claim this exemption without being added here.**

---

## The aggregates

### Identity
**Root:** User
**Contains:** refresh tokens, password reset tokens

| Invariant | Enforced by |
|---|---|
| Email is unique across all users | Unique index |
| A refresh token belongs to exactly one user | FK |
| A used or rotated refresh token cannot be reused | Status + service check |
| Reuse of a revoked token revokes the whole token family | Service |

### Organisation
**Root:** Organisation
**Contains:** memberships

| Invariant | Enforced by |
|---|---|
| An organisation has at least one OWNER membership | Service (checked on removal) |
| A user has at most one membership per organisation | Unique index `(user_id, organisation_id)` |
| An INDIVIDUAL organisation has exactly one membership | Service |
| Membership capability is valid for the organisation's kind | Service + permission map |

### Provider Onboarding *(M2)*
**Root:** Provider
**Contains:** documents, check results, stage history

| Invariant | Enforced by |
|---|---|
| Cannot reach ACTIVATED with an unresolved required check | Service |
| Stage transitions follow the declared order | Stage machine |
| Only an ACTIVATED provider is visible to Discovery (BR1) | Query filter + service |

### Offering *(M4)*
**Root:** Offering
**Contains:** versions, inclusions

| Invariant | Enforced by |
|---|---|
| Exactly one ACTIVE version per offering | Partial unique index |
| A version referenced by a quote is immutable | No update path; edits create a new version |
| Price is a non-negative integer in minor units | Check constraint |

### Booking *(M7 — the one that matters most)*
**Root:** Booking
**Contains:** assignments, schedules, status history

| Invariant | Enforced by |
|---|---|
| **At most one ACTIVE assignment (BR2)** | **Partial unique index** `(booking_id) WHERE status = 'ACTIVE'` |
| Booking status is consistent with its active assignment | State machine in the service |
| Every transition is legal for the current status | State machine |
| Every transition is recorded with actor, timestamp, reason (BR16) | Service, same transaction |
| The quoted price never changes after assignment (BR8) | Immutable quote reference |
| Only the actively assigned provider may accept/reject/complete (BR3, BR5) | Service ownership check |
| Concurrent transitions cannot interleave | Optimistic `version` column |

### Field Service Ticket *(M12)*
**Root:** Ticket
**Contains:** updates, report

| Invariant | Enforced by |
|---|---|
| Cannot close without a report (BR11) | Service |
| Only the assigned engineer may close (BR11) | Service ownership check |
| A ticket references exactly one drone | FK |

---

## What is deliberately NOT inside an aggregate

These cross boundaries and are therefore **eventually consistent by design**. Stating this prevents someone reaching for a distributed transaction later.

| Thing | Why it is outside |
|---|---|
| Payment record → Booking | A payment is recorded *about* a completed booking, not part of it |
| Review → Booking, Provider | Written after the fact; a delay is harmless |
| Provider average rating | A derived read value. Recomputed from reviews, never authoritative |
| Notification | A side effect of an event. Losing one is cosmetic |
| Activity log | Observation, not business state |
| Drone serviceability ← Ticket | Ticket is the source of truth; drone status follows |

**Consequence:** a provider's displayed rating may lag a new review by moments. That is acceptable. Making it immediate would mean writing to the Provider aggregate inside the Review transaction, coupling two modules that should not know about each other.

---

## How this maps to code

- One aggregate ≈ one module's core entity.
- A repository loads and saves **whole aggregates**, never a child on its own.
- A service opens **one** transaction, enforces the invariants above, then emits events.
- Anything a listener does happens in a **separate** transaction.

If you find yourself opening a transaction that touches two roots, the boundary is wrong — or the rule belongs in an event handler.
