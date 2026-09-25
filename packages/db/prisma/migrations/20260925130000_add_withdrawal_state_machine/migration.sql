-- Add the order-book query index used by the API market-data service.
CREATE INDEX "Order_marketId_status_price_createdAt_idx"
ON "Order"("marketId", "status", "price", "createdAt");

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "destination" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reservedAt" TIMESTAMP(3),
    "processingAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_userId_externalRef_key"
ON "Withdrawal"("userId", "externalRef");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx"
ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx"
ON "Withdrawal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_nextAttemptAt_idx"
ON "Withdrawal"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Withdrawal_externalRef_idx"
ON "Withdrawal"("externalRef");

-- CreateTable
CREATE TABLE "WithdrawalAttempt" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerRef" TEXT,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WithdrawalAttempt_withdrawalId_attemptNumber_key"
ON "WithdrawalAttempt"("withdrawalId", "attemptNumber");

-- CreateIndex
CREATE INDEX "WithdrawalAttempt_withdrawalId_createdAt_idx"
ON "WithdrawalAttempt"("withdrawalId", "createdAt");

-- CreateIndex
CREATE INDEX "WithdrawalAttempt_status_createdAt_idx"
ON "WithdrawalAttempt"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Withdrawal"
ADD CONSTRAINT "Withdrawal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalAttempt"
ADD CONSTRAINT "WithdrawalAttempt_withdrawalId_fkey"
FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
