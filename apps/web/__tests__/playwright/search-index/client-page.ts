import { createSearchIndexClient } from "@/utils/email-cache/search-index-client";
import { getEmailCacheDatabase } from "@/utils/email-cache/database";
import {
  activateMailSync,
  clearMailActivation,
} from "@/utils/email-cache/mail-activation";

const scope = { emailAccountId: "account", generation: "first" };
const client = createSearchIndexClient();
Object.assign(window, {
  indexClientTest: {
    client,
    async activate() {
      activateMailSync(scope.emailAccountId);
      await (await getEmailCacheDatabase())!.put("searchIndexAccounts", scope);
    },
    async removeSource() {
      clearMailActivation(scope.emailAccountId);
      await (await getEmailCacheDatabase())!.delete(
        "searchIndexAccounts",
        scope.emailAccountId,
      );
    },
    state() {
      return client.request(scope, {
        command: "state",
        emailAccountId: scope.emailAccountId,
      });
    },
    reset() {
      return client.request(scope, {
        command: "reset",
        request: { ...scope, expectedGeneration: null },
      });
    },
    apply() {
      return client.request(scope, {
        command: "apply",
        request: {
          ...scope,
          expectedRevision: 0,
          revision: 1,
          upserts: [
            {
              id: "message",
              threadId: "thread",
              subject: "Sample",
              snippet: "",
              headers: { from: "", to: "", subject: "Sample", date: "" },
              labelIds: [],
              internalDate: "1700000000000",
              textPlain: "searchable body",
            },
          ],
          deletes: [],
        },
      });
    },
    search() {
      return client.request(scope, {
        command: "search",
        request: { ...scope, query: "searchable", labels: [] },
      });
    },
    cleanup() {
      return client.cleanupAccount(scope);
    },
  },
});
