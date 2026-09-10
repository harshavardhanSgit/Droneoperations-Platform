-- The agreed date, copied from the CONFIRMED schedule, so a provider's inbox can be ordered
-- and paged by it. Prisma cannot sort by a filtered row of a to-many relation, and a booking
-- has many booking_schedules rows.

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "confirmed_date" DATE;

-- Backfill. Left null where nothing is confirmed yet — that is the honest value, not a guess
-- at preferred_date. booking_schedules_one_confirmed guarantees at most one row per booking.
UPDATE "bookings" b
SET "confirmed_date" = s."proposed_date"
FROM "booking_schedules" s
WHERE s."booking_id" = b."id" AND s."status" = 'CONFIRMED';

-- CreateIndex
CREATE INDEX "bookings_confirmed_date_idx" ON "bookings"("confirmed_date");
