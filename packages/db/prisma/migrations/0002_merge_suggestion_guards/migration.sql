-- Defense in depth: no self-suggestions at DB layer
ALTER TABLE "MergeSuggestion"
  ADD CONSTRAINT "MergeSuggestion_no_self_check"
  CHECK ("newPersonId" <> "targetPersonId");

-- Prevent duplicate open/any suggestions for the same import pair
CREATE UNIQUE INDEX "MergeSuggestion_reportImportId_newPersonId_targetPersonId_key"
  ON "MergeSuggestion"("reportImportId", "newPersonId", "targetPersonId");
