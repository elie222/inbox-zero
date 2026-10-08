import { randomUUID } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import { createEmulator } from "emulate";
import { expect, it } from "vitest";

it("preserves literal Graph searches and continuation pages in the installed emulator", async () => {
  const email = "graph-query-test@example.com";
  const marker = randomUUID().replaceAll("-", "");
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
          subject: `${marker} ${subject}`,
          body: { contentType: "Text", content: "Example body" },
        }),
      });
      expect(created.status).toBe(201);
      const message = await created.json();
      if (subject.includes("scheduled")) {
        expected.push(message.id);
        const updated = await fetch(
          new URL(`/v1.0/me/messages/${message.id}`, emulator.url),
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ importance: "high" }),
          },
        );
        expect(updated.status).toBe(200);
      }
    }
    for (const route of [
      "/v1.0/me/messages",
      "/v1.0/me/mailFolders/drafts/messages",
    ]) {
      for (const expression of [
        '"Native" AND "scheduled"',
        'subject:"report & C# 50%"',
        "NOT unrelated",
        "size>=0 NOT unrelated",
        "importance:high",
        "hasattachments:false NOT unrelated",
        "received>=2000-01-01 NOT unrelated",
        '(subject:"report" OR subject:"unrelated") NOT unrelated',
        'subject:"report" OR (subject:"unrelated" AND body:"absent")',
        'NOT (subject:"unrelated" OR body:"absent")',
      ]) {
        const url = new URL(route, emulator.url);
        const query = JSON.stringify(`(${expression}) AND "${marker}"`);
        url.searchParams.set("$search", query);
        url.searchParams.set("$top", "1");
        const response = await fetch(url, { headers });
        expect(response.status).toBe(200);
        const first = await response.json();
        expect(first.value).toHaveLength(1);
        expect(first["@odata.nextLink"]).toBeTruthy();
        const nextURL = new URL(first["@odata.nextLink"], emulator.url);
        expect(nextURL.searchParams.get("$search")).toBe(query);
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
      for (const expression of [
        "hasattachments:true",
        "size>1000000",
        "received<2000-01-01",
        "importance:low",
      ]) {
        const url = new URL(route, emulator.url);
        url.searchParams.set(
          "$search",
          JSON.stringify(`(${expression}) AND "${marker}"`),
        );
        const response = await fetch(url, { headers });
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.value).toEqual([]);
        expect(result["@odata.nextLink"]).toBeUndefined();
      }
      for (const expression of [
        'subject:"report" OR',
        'subject:("report"',
        "unsupported:Native",
        "unsupported>5",
        "size>5MB",
      ]) {
        const invalidURL = new URL(route, emulator.url);
        invalidURL.searchParams.set("$search", JSON.stringify(expression));
        const invalid = await fetch(invalidURL, { headers });
        expect(invalid.status).toBe(400);
        expect((await invalid.json()).error.code).toBe(
          "ErrorInvalidSearchQuery",
        );
      }
    }
  } finally {
    await emulator.close();
  }
});
