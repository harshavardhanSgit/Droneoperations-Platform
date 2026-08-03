-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'SCHEDULED', 'AWAITING_CONFIRMATION', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimeWindow" AS ENUM ('DAWN', 'MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStrategy" AS ENUM ('CUSTOMER_CHOICE', 'PLATFORM_AUTO', 'PLATFORM_MANAGED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "customer_organisation_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "location_note" TEXT,
    "offering_version_id" UUID,
    "unit_price_minor" INTEGER,
    "estimated_total_minor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricing_unit" "PricingUnit" NOT NULL,
    "preferred_date" DATE NOT NULL,
    "preferred_window" "TimeWindow" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "cancelled_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_assignments" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "offering_version_id" UUID NOT NULL,
    "strategy" "AssignmentStrategy" NOT NULL DEFAULT 'CUSTOMER_CHOICE',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_by_user_id" UUID NOT NULL,
    "rejection_reason" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "booking_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_organisation_id" UUID NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bookings_customer_organisation_id_status_idx" ON "bookings"("customer_organisation_id", "status");

-- CreateIndex
CREATE INDEX "bookings_status_preferred_date_idx" ON "bookings"("status", "preferred_date");

-- CreateIndex
CREATE INDEX "booking_assignments_provider_id_status_idx" ON "booking_assignments"("provider_id", "status");

-- CreateIndex
CREATE INDEX "booking_assignments_booking_id_assigned_at_idx" ON "booking_assignments"("booking_id", "assigned_at");

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_created_at_idx" ON "booking_status_history"("booking_id", "created_at");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_organisation_id_fkey" FOREIGN KEY ("customer_organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offering_version_id_fkey" FOREIGN KEY ("offering_version_id") REFERENCES "offering_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignments" ADD CONSTRAINT "booking_assignments_offering_version_id_fkey" FOREIGN KEY ("offering_version_id") REFERENCES "offering_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
