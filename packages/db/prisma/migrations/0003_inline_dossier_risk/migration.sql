-- AlterEnum: ReportFormat += inline-dossier (mapped Prisma name: inline_dossier)
ALTER TYPE "ReportFormat" ADD VALUE 'inline-dossier';

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "RiskScore" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "label" TEXT,
    "categories" JSONB NOT NULL,
    "articles" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RiskScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "title" TEXT,
    "body" JSONB,
    "articleCode" TEXT,
    "caseNumber" TEXT,
    "sentenceDate" TEXT,
    "decision" TEXT,
    "region" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskScore_personId_idx" ON "RiskScore"("personId");

-- CreateIndex
CREATE INDEX "Incident_personId_idx" ON "Incident"("personId");

-- CreateIndex
CREATE INDEX "Incident_articleCode_idx" ON "Incident"("articleCode");

-- AddForeignKey
ALTER TABLE "RiskScore" ADD CONSTRAINT "RiskScore_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
