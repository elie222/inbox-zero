-- CreateTable
CREATE TABLE "EmailSignature" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "EmailSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailSignature_emailAccountId_name_key" ON "EmailSignature"("emailAccountId", "name");

-- AddForeignKey
ALTER TABLE "EmailSignature" ADD CONSTRAINT "EmailSignature_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
