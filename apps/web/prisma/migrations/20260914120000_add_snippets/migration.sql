-- CreateTable
CREATE TABLE "Snippet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shortcut" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "Snippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Snippet_emailAccountId_shortcut_key" ON "Snippet"("emailAccountId", "shortcut");

-- CreateIndex
CREATE INDEX "Snippet_emailAccountId_idx" ON "Snippet"("emailAccountId");

-- AddForeignKey
ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
