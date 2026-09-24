-- CreateTable
CREATE TABLE "ProcessedCommand" (
    "commandId" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedCommand_pkey" PRIMARY KEY ("commandId")
);
