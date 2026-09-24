/*
  Warnings:

  - A unique constraint covering the columns `[asset,externalRef]` on the table `Deposit` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Deposit` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "creditedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_externalRef_idx" ON "Deposit"("externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_asset_externalRef_key" ON "Deposit"("asset", "externalRef");
