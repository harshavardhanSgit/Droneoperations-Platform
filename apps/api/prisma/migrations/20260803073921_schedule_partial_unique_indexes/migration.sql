-- At most ONE outstanding proposal per booking. Without this, both parties
-- proposing simultaneously leaves two pending dates and no way to say which
-- one confirming refers to.
CREATE UNIQUE INDEX "booking_schedules_one_pending"
  ON "booking_schedules" ("booking_id")
  WHERE "status" = 'PENDING';

-- At most ONE confirmed schedule. A booking cannot be agreed for two dates.
CREATE UNIQUE INDEX "booking_schedules_one_confirmed"
  ON "booking_schedules" ("booking_id")
  WHERE "status" = 'CONFIRMED';
