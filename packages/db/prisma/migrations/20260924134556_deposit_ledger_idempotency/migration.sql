/*
  Warnings:

  - A unique constraint covering the columns `[reason,referenceId]` on the table `LedgerEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reason_referenceId_key" ON "LedgerEntry"("reason", "referenceId");
