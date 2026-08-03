-- Hand-written: Prisma's schema language cannot express PARTIAL unique
-- indexes, and these two invariants cannot be enforced any other way.
--
-- An application-level "does one already exist?" check is check-then-act: two
-- concurrent requests both read nothing, both insert, and the invariant is
-- silently violated. Only the database can make the second write lose.

-- One ACTIVE offering per (provider, service type). Withdrawn ones may pile up.
CREATE UNIQUE INDEX "offerings_one_active_per_service"
  ON "offerings" ("provider_id", "service_type_id")
  WHERE "status" = 'ACTIVE';

-- Exactly one CURRENT version per offering (effective_to IS NULL). This is
-- what makes repricing safe: if two requests try to open a new version at
-- once, one of them fails instead of leaving two "current" prices.
CREATE UNIQUE INDEX "offering_versions_one_current"
  ON "offering_versions" ("offering_id")
  WHERE "effective_to" IS NULL;
