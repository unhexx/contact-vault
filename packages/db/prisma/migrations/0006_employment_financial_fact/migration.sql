-- CreateTable
CREATE TABLE "Employment" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "employer" TEXT,
    "position" TEXT,
    "wish" TEXT,
    "periodFrom" TEXT,
    "periodTo" TEXT,
    "extras" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialFact" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "amount" TEXT,
    "currency" TEXT,
    "year" TEXT,
    "kind" TEXT,
    "employer" TEXT,
    "raw" TEXT,
    "extras" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FinancialFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employment_personId_idx" ON "Employment"("personId");

-- CreateIndex
CREATE INDEX "Employment_employer_idx" ON "Employment"("employer");

-- CreateIndex
CREATE INDEX "FinancialFact_personId_idx" ON "FinancialFact"("personId");

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialFact" ADD CONSTRAINT "FinancialFact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
