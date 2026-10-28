import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { scim } from "@better-auth/scim";
import { betterAuth } from "better-auth";
import { onTestFinished, describe, expect, test } from "vitest";

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";
const PROVIDER_ID = "okta-provider";
const SCIM_SECRET = "new-scim-opaque-secret-with-sufficient-entropy";
const BASE_URL = "http://localhost:3000";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Better Auth SCIM integration",
  { timeout: 30_000 },
  () => {
    test("provisions, lists, updates, patches, and deletes a SCIM user", async () => {
      const database = new DatabaseSync(":memory:");
      onTestFinished(() => database.close());
      const auth = betterAuth({
        database,
        baseURL: BASE_URL,
        secret: "test-secret-with-enough-entropy-for-scim",
        plugins: [
          scim({
            connections: [
              {
                id: PROVIDER_ID,
                credentials: [
                  { type: "bearer", id: "primary", token: SCIM_SECRET },
                ],
              },
            ],
          }),
        ],
      });
      await (await getMigrations(auth.options)).runMigrations();
      const token = SCIM_SECRET;

      const configResponse = await auth.handler(
        scimRequest("/api/auth/scim/v2/ServiceProviderConfig", { token }),
      );
      expect(configResponse.status).toBe(200);

      const createResponse = await auth.handler(
        scimRequest("/api/auth/scim/v2/Users", {
          method: "POST",
          token,
          body: {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            userName: "user@example.com",
            externalId: "00u_test_user",
            name: {
              givenName: "Test",
              familyName: "User",
            },
            emails: [{ value: "user@example.com", primary: true }],
          },
        }),
      );
      expect(createResponse.status, await createResponse.clone().text()).toBe(
        201,
      );
      const created = await createResponse.json();
      expect(created.userName).toBe("user@example.com");
      expect(created.externalId).toBe("00u_test_user");

      const listResponse = await auth.handler(
        scimRequest(
          '/api/auth/scim/v2/Users?filter=userName eq "user@example.com"',
          { token },
        ),
      );
      expect(listResponse.status).toBe(200);
      const list = await listResponse.json();
      expect(list.totalResults).toBe(1);
      expect(list.Resources[0].id).toBe(created.id);

      const updateResponse = await auth.handler(
        scimRequest(`/api/auth/scim/v2/Users/${created.id}`, {
          method: "PUT",
          token,
          body: {
            schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
            userName: "updated@example.com",
            externalId: "00u_test_user",
            name: {
              formatted: "Updated User",
            },
            emails: [{ value: "updated@example.com", primary: true }],
          },
        }),
      );
      expect(updateResponse.status).toBe(200);
      const updated = await updateResponse.json();
      expect(updated.userName).toBe("updated@example.com");
      expect(updated.name.formatted).toBe("Updated User");

      const patchResponse = await auth.handler(
        scimRequest(`/api/auth/scim/v2/Users/${created.id}`, {
          method: "PATCH",
          token,
          body: {
            schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            Operations: [
              {
                op: "replace",
                path: "name.formatted",
                value: "Patched User",
              },
            ],
          },
        }),
      );
      expect(patchResponse.status).toBe(200);

      const getResponse = await auth.handler(
        scimRequest(`/api/auth/scim/v2/Users/${created.id}`, { token }),
      );
      expect(getResponse.status).toBe(200);
      const patched = await getResponse.json();
      expect(patched.displayName).toBe("Patched User");

      const deleteResponse = await auth.handler(
        scimRequest(`/api/auth/scim/v2/Users/${created.id}`, {
          method: "DELETE",
          token,
        }),
      );
      expect(deleteResponse.status).toBe(204);

      const deletedGetResponse = await auth.handler(
        scimRequest(`/api/auth/scim/v2/Users/${created.id}`, { token }),
      );
      expect(deletedGetResponse.status).toBe(404);
    });
  },
);

function scimRequest(
  path: string,
  {
    method = "GET",
    token,
    body,
  }: {
    method?: string;
    token: string;
    body?: unknown;
  },
) {
  return new Request(`${BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/scim+json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
