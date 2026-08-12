-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "location_label" TEXT,
    "default_area_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_organisation_id_key" ON "customer_profiles"("organisation_id");

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_default_area_id_fkey" FOREIGN KEY ("default_area_id") REFERENCES "areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
