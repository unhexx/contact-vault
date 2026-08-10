-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('void-html', 'sectioned-text', 'unknown');

-- CreateEnum
CREATE TYPE "ReportImportStatus" AS ENUM ('pending', 'parsed', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('passport_ru', 'passport_foreign', 'snils', 'inn', 'oms', 'driving_license', 'birth_cert', 'military', 'other');

-- CreateEnum
CREATE TYPE "AddressCategory" AS ENUM ('registration', 'residence', 'delivery', 'work', 'other');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('family', 'possible', 'colleague', 'neighbor', 'other');

-- CreateEnum
CREATE TYPE "ContactPointKind" AS ENUM ('phone', 'email', 'social', 'messenger');

-- CreateTable
CREATE TABLE "Person" (
    "id" UUID NOT NULL,
    "canonicalFull" TEXT,
    "canonicalLast" TEXT,
    "canonicalFirst" TEXT,
    "canonicalMiddle" TEXT,
    "dateOfBirth" TEXT,
    "placeOfBirth" TEXT,
    "gender" TEXT,
    "extras" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NameVariant" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "full" TEXT NOT NULL,
    "last" TEXT,
    "first" TEXT,
    "middle" TEXT,
    "dobHint" TEXT,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NameVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactPoint" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "kind" "ContactPointKind" NOT NULL,
    "e164" TEXT,
    "raw" TEXT,
    "email" TEXT,
    "emailNorm" TEXT,
    "network" TEXT,
    "username" TEXT,
    "url" TEXT,
    "identifier" TEXT,
    "displayName" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContactPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityDocument" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "numberNorm" TEXT NOT NULL,
    "series" TEXT,
    "issuedAt" TEXT,
    "issuedBy" TEXT,
    "departmentCode" TEXT,
    "validUntil" TEXT,
    "status" TEXT,
    "meta" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IdentityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "raw" TEXT NOT NULL,
    "normalized" TEXT,
    "category" "AddressCategory" NOT NULL,
    "periodFrom" TEXT,
    "periodTo" TEXT,
    "components" JSONB,
    "geo" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "type" "RelationshipType" NOT NULL,
    "relationLabel" TEXT,
    "relatedPersonId" UUID,
    "relatedPersonHint" JSONB NOT NULL,
    "sharedAddress" TEXT,
    "strength" DOUBLE PRECISION,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportImport" (
    "id" UUID NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "status" "ReportImportStatus" NOT NULL DEFAULT 'pending',
    "filename" TEXT,
    "contentHash" TEXT NOT NULL,
    "reportQuery" TEXT,
    "byteSize" INTEGER,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "rawStorage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonSourceReport" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "reportImportId" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "mode" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonSourceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeSuggestion" (
    "id" UUID NOT NULL,
    "reportImportId" UUID NOT NULL,
    "targetPersonId" UUID NOT NULL,
    "newPersonId" UUID NOT NULL,
    "matchedOn" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "MergeSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'local',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");

-- CreateIndex
CREATE INDEX "Person_canonicalFull_idx" ON "Person"("canonicalFull");

-- CreateIndex
CREATE INDEX "Person_dateOfBirth_idx" ON "Person"("dateOfBirth");

-- CreateIndex
CREATE INDEX "Person_updatedAt_id_idx" ON "Person"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "NameVariant_personId_idx" ON "NameVariant"("personId");

-- CreateIndex
CREATE INDEX "NameVariant_full_idx" ON "NameVariant"("full");

-- CreateIndex
CREATE INDEX "ContactPoint_personId_idx" ON "ContactPoint"("personId");

-- CreateIndex
CREATE INDEX "ContactPoint_e164_idx" ON "ContactPoint"("e164");

-- CreateIndex
CREATE INDEX "ContactPoint_emailNorm_idx" ON "ContactPoint"("emailNorm");

-- CreateIndex
CREATE INDEX "ContactPoint_kind_identifier_idx" ON "ContactPoint"("kind", "identifier");

-- CreateIndex
CREATE INDEX "IdentityDocument_personId_idx" ON "IdentityDocument"("personId");

-- CreateIndex
CREATE INDEX "IdentityDocument_type_numberNorm_idx" ON "IdentityDocument"("type", "numberNorm");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityDocument_type_numberNorm_personId_key" ON "IdentityDocument"("type", "numberNorm", "personId");

-- CreateIndex
CREATE INDEX "Address_personId_idx" ON "Address"("personId");

-- CreateIndex
CREATE INDEX "Relationship_personId_idx" ON "Relationship"("personId");

-- CreateIndex
CREATE INDEX "Relationship_relatedPersonId_idx" ON "Relationship"("relatedPersonId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportImport_contentHash_key" ON "ReportImport"("contentHash");

-- CreateIndex
CREATE INDEX "ReportImport_createdAt_idx" ON "ReportImport"("createdAt");

-- CreateIndex
CREATE INDEX "PersonSourceReport_reportImportId_idx" ON "PersonSourceReport"("reportImportId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonSourceReport_personId_reportImportId_key" ON "PersonSourceReport"("personId", "reportImportId");

-- CreateIndex
CREATE INDEX "MergeSuggestion_targetPersonId_status_idx" ON "MergeSuggestion"("targetPersonId", "status");

-- CreateIndex
CREATE INDEX "MergeSuggestion_newPersonId_status_idx" ON "MergeSuggestion"("newPersonId", "status");

-- CreateIndex
CREATE INDEX "MergeSuggestion_reportImportId_idx" ON "MergeSuggestion"("reportImportId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "NameVariant" ADD CONSTRAINT "NameVariant_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPoint" ADD CONSTRAINT "ContactPoint_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityDocument" ADD CONSTRAINT "IdentityDocument_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSourceReport" ADD CONSTRAINT "PersonSourceReport_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSourceReport" ADD CONSTRAINT "PersonSourceReport_reportImportId_fkey" FOREIGN KEY ("reportImportId") REFERENCES "ReportImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_reportImportId_fkey" FOREIGN KEY ("reportImportId") REFERENCES "ReportImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeSuggestion" ADD CONSTRAINT "MergeSuggestion_newPersonId_fkey" FOREIGN KEY ("newPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
