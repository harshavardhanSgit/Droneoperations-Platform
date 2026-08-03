-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('PROVIDER');

-- CreateEnum
CREATE TYPE "ProviderDocumentKind" AS ENUM ('BUSINESS_REGISTRATION', 'DRONE_REGISTRATION', 'PILOT_LICENCE', 'INSURANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'READY');

-- AlterEnum
ALTER TYPE "ProviderStage" ADD VALUE 'DOCUMENTS_SUBMITTED';

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "owner_type" "DocumentOwnerType" NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "ProviderDocumentKind",
    "original_filename" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_owner_type_owner_id_status_idx" ON "documents"("owner_type", "owner_id", "status");
