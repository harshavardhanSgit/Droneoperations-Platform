-- CreateEnum
CREATE TYPE "Serviceability" AS ENUM ('SERVICEABLE', 'UNDER_MAINTENANCE', 'RETIRED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "drones" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "registration_number" TEXT NOT NULL,
    "capacity_litres" INTEGER,
    "serviceability" "Serviceability" NOT NULL DEFAULT 'SERVICEABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" UUID NOT NULL,
    "drone_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "raised_by_user_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_engineer_user_id" UUID,
    "assigned_by_user_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "closed_at" TIMESTAMP(3),
    "report_document_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_status" "TicketStatus",
    "to_status" "TicketStatus" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drones_registration_number_key" ON "drones"("registration_number");

-- CreateIndex
CREATE INDEX "drones_provider_id_serviceability_idx" ON "drones"("provider_id", "serviceability");

-- CreateIndex
CREATE INDEX "maintenance_tickets_provider_id_status_idx" ON "maintenance_tickets"("provider_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_tickets_status_created_at_idx" ON "maintenance_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "maintenance_tickets_assigned_engineer_user_id_status_idx" ON "maintenance_tickets"("assigned_engineer_user_id", "status");

-- CreateIndex
CREATE INDEX "ticket_events_ticket_id_created_at_idx" ON "ticket_events"("ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "drones" ADD CONSTRAINT "drones_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_drone_id_fkey" FOREIGN KEY ("drone_id") REFERENCES "drones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
