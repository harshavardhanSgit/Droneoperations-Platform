-- BR2: a booking has at most ONE active assignment.
--
-- "Active" means awaiting an answer (PENDING) or currently fulfilling
-- (ACCEPTED). REJECTED, SUPERSEDED and CANCELLED rows accumulate as history —
-- that history is the whole point of modelling assignment as a table (S1).
--
-- This CANNOT be an application check. Two concurrent requests -- a customer
-- reassigning while the provider accepts -- would both read "no active
-- assignment" and both write one. Only the database can make the second lose.
CREATE UNIQUE INDEX "booking_assignments_one_active"
  ON "booking_assignments" ("booking_id")
  WHERE "status" IN ('PENDING', 'ACCEPTED');
