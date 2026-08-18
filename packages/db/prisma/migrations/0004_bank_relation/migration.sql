-- CreateTable
CREATE TABLE "BankRelation" (
    "id" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHint" TEXT,
    "role" TEXT,
    "bik" TEXT,
    "extras" JSONB,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BankRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankRelation_personId_idx" ON "BankRelation"("personId");

-- CreateIndex
CREATE INDEX "BankRelation_bankName_idx" ON "BankRelation"("bankName");

-- AddForeignKey
ALTER TABLE "BankRelation" ADD CONSTRAINT "BankRelation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
