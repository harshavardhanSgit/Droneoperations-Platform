-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_ASSIGNED', 'BOOKING_ACCEPTED', 'BOOKING_REJECTED', 'BOOKING_SCHEDULE_PROPOSED', 'BOOKING_SCHEDULE_CONFIRMED', 'BOOKING_WORK_COMPLETED', 'BOOKING_COMPLETION_CONFIRMED', 'BOOKING_CANCELLED', 'PAYMENT_RECORDED', 'REVIEW_RECEIVED', 'PROVIDER_ACTIVATED', 'PROVIDER_REJECTED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "booking_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organisation_id_read_at_created_at_idx" ON "notifications"("organisation_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
