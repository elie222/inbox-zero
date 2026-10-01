import { createServer, type AddressInfo } from "node:net";
import { createEmulator } from "emulate";
import { expect, it } from "vitest";

it("preserves literal Graph searches and continuation pages in the installed emulator", async () => {
  const email = "user@example.com";
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const emulator = await createEmulator({
    service: "microsoft",
    port,
    seed: {
      tokens: { token: { login: email } },
      microsoft: { users: [{ email, name: "Test User" }] },
    },
  });
  const headers = {
    Authorization: "Bearer token",
    "Content-Type": "application/json",
  };
  try {
    const expected: string[] = [];
    for (const subject of [
      "Native scheduled report & C# 50%",
      "Native scheduled report & C# 50% second",
      "Native unrelated",
    ]) {
      const created = await fetch(new URL("/v1.0/me/messages", emulator.url), {
        method: "POST",
        headers,
        body: JSON.stringify({
          subject,
          body: { contentType: "Text", content: "Example body" },
        }),
      });
      expect(created.status).toBe(201);
      const message = await created.json();
      if (subject.includes("scheduled")) expected.push(message.id);
    }
    for (const route of [
      "/v1.0/me/messages",
      "/v1.0/me/mailFolders/drafts/messages",
    ]) {
      for (const expression of [
        '"Native" AND "scheduled"',
        'subject:"report & C# 50%"',
      ]) {
        const url = new URL(route, emulator.url);
        url.searchParams.set("$search", JSON.stringify(expression));
        url.searchParams.set("$top", "1");
        const response = await fetch(url, { headers });
        expect(response.status).toBe(200);
        const first = await response.json();
        expect(first.value).toHaveLength(1);
        expect(first["@odata.nextLink"]).toBeTruthy();
        const nextURL = new URL(first["@odata.nextLink"], emulator.url);
        expect(nextURL.searchParams.get("$search")).toBe(
          JSON.stringify(expression),
        );
        const next = await fetch(nextURL, { headers });
        expect(next.status).toBe(200);
        const last = await next.json();
        expect(last.value).toHaveLength(1);
        expect(last["@odata.nextLink"]).toBeUndefined();
        expect(
          new Set(
            [...first.value, ...last.value].map(
              (message: { id: string }) => message.id,
            ),
          ),
        ).toEqual(new Set(expected));
      }
      const invalidURL = new URL(route, emulator.url);
      invalidURL.searchParams.set(
        "$search",
        JSON.stringify('subject:"report" OR body:"other"'),
      );
      const invalid = await fetch(invalidURL, { headers });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error.code).toBe("ErrorInvalidSearchQuery");
    }
  } finally {
    await emulator.close();
  }
});
