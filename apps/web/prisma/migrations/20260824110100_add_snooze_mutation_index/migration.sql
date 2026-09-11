CREATE UNIQUE INDEX CONCURRENTLY "SnoozedThread_emailAccountId_clientMutationId_key"
ON "SnoozedThread"("emailAccountId", "clientMutationId");
