-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SUPERSEDED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SchedulePartyRole" AS ENUM ('CUSTOMER', 'PROVIDER');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "completion_note" TEXT,
ADD COLUMN     "final_amount_minor" INTEGER,
ADD COLUMN     "final_quantity" INTEGER;

-- CreateTable
CREATE TABLE "booking_schedules" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "proposed_date" DATE NOT NULL,
    "proposed_window" "TimeWindow" NOT NULL,
    "proposed_by_role" "SchedulePartyRole" NOT NULL,
    "proposed_by_user_id" UUID NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_by_user_id" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_schedules_booking_id_created_at_idx" ON "booking_schedules"("booking_id", "created_at");

-- AddForeignKey
ALTER TABLE "booking_schedules" ADD CONSTRAINT "booking_schedules_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
