CREATE TABLE "LearnedWritingStyle" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "memoryCount" INTEGER NOT NULL DEFAULT 0,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "LearnedWritingStyle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnedWritingStyle_emailAccountId_key" ON "LearnedWritingStyle"("emailAccountId");

ALTER TABLE "LearnedWritingStyle" ADD CONSTRAINT "LearnedWritingStyle_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
