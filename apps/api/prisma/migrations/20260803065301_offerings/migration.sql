-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OfferingInclusion" AS ENUM ('CHEMICAL', 'WATER', 'TRANSPORT', 'LABOUR', 'FUEL');

-- CreateTable
CREATE TABLE "offerings" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "service_type_id" UUID NOT NULL,
    "status" "OfferingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_versions" (
    "id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "pricing_unit" "PricingUnit" NOT NULL,
    "min_quantity" INTEGER,
    "inclusions" "OfferingInclusion"[],
    "notes" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "offering_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_areas" (
    "offering_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offering_areas_pkey" PRIMARY KEY ("offering_id","area_id")
);

-- CreateIndex
CREATE INDEX "offerings_provider_id_status_idx" ON "offerings"("provider_id", "status");

-- CreateIndex
CREATE INDEX "offerings_service_type_id_status_idx" ON "offerings"("service_type_id", "status");

-- CreateIndex
CREATE INDEX "offering_versions_offering_id_effective_to_idx" ON "offering_versions"("offering_id", "effective_to");

-- CreateIndex
CREATE UNIQUE INDEX "offering_versions_offering_id_version_number_key" ON "offering_versions"("offering_id", "version_number");

-- CreateIndex
CREATE INDEX "offering_areas_area_id_idx" ON "offering_areas"("area_id");

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering_versions" ADD CONSTRAINT "offering_versions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering_areas" ADD CONSTRAINT "offering_areas_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offering_areas" ADD CONSTRAINT "offering_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
