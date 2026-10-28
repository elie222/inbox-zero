import { createServer, type AddressInfo } from "node:net";
import { createEmulator } from "emulate";
import { expect, it } from "vitest";

it("supports negated mailbox scopes with epoch date bounds", async () => {
  const email = "user@example.com";
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  const emulator = await createEmulator({
    service: "google",
    port,
    seed: {
      tokens: { token: { login: email } },
      google: {
        users: [{ email, name: "Test User" }],
        messages: ["INBOX", "DRAFT", "SPAM", "TRASH"].map((label) => ({
          id: label.toLowerCase(),
          user_email: email,
          from: "sender@example.com",
          to: email,
          subject: "Example",
          body_text: "Example message",
          label_ids: [label],
          internal_date: "1767225600000",
        })),
      },
    },
  });
  try {
    const url = new URL("/gmail/v1/users/me/messages", emulator.url);
    url.searchParams.set(
      "q",
      "after:1767225599 before:1767225601 -in:spam -in:trash -in:drafts",
    );
    url.searchParams.set("includeSpamTrash", "true");
    const response = await fetch(url, {
      headers: { Authorization: "Bearer token" },
    });
    expect(response.status).toBe(200);
    expect(
      (await response.json()).messages.map(
        (message: { id: string }) => message.id,
      ),
    ).toEqual(["inbox"]);
  } finally {
    await emulator.close();
  }
});
