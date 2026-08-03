-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('PER_ACRE', 'PER_SQ_KM', 'PER_HOUR', 'PER_DAY', 'PER_ASSET');

-- CreateEnum
CREATE TYPE "CatalogueStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AreaLevel" AS ENUM ('STATE', 'DISTRICT', 'TALUKA');

-- CreateTable
CREATE TABLE "service_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricing_unit" "PricingUnit" NOT NULL,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "level" "AreaLevel" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_types_code_key" ON "service_types"("code");

-- CreateIndex
CREATE INDEX "service_types_status_sort_order_idx" ON "service_types"("status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "areas_code_key" ON "areas"("code");

-- CreateIndex
CREATE INDEX "areas_level_status_idx" ON "areas"("level", "status");

-- CreateIndex
CREATE UNIQUE INDEX "areas_parent_id_name_key" ON "areas"("parent_id", "name");

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
