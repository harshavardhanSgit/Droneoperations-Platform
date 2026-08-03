-- CreateEnum
CREATE TYPE "ProviderStage" AS ENUM ('REGISTERED', 'PROFILE_COMPLETE', 'UNDER_REVIEW', 'ACTIVATED', 'REJECTED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "legal_name" TEXT,
    "registration_number" TEXT,
    "contact_phone" TEXT,
    "address_line" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "stage" "ProviderStage" NOT NULL DEFAULT 'REGISTERED',
    "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_stage_events" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "from_stage" "ProviderStage",
    "to_stage" "ProviderStage" NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_stage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_organisation_id_key" ON "providers"("organisation_id");

-- CreateIndex
CREATE INDEX "providers_stage_idx" ON "providers"("stage");

-- CreateIndex
CREATE INDEX "provider_stage_events_provider_id_created_at_idx" ON "provider_stage_events"("provider_id", "created_at");

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_stage_events" ADD CONSTRAINT "provider_stage_events_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
