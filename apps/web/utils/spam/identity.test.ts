import { expect, it } from "vitest";
import { lookupToken, spamMessageKey } from "./identity";
import { getMockMessage } from "@/__tests__/helpers";
it("keeps width/canonical lookup independent of raw case and compatibility characters", () => {
  expect(lookupToken("Ａé")).toBe("Ae\u0301");
  expect(lookupToken("A")).not.toBe(lookupToken("a"));
  expect(lookupToken("①")).toBe("①");
});
it("recognizes a message after moving but does not trust a reused Message-ID alone", () => {
  const message = getMockMessage();
  const headers = { ...message.headers, "message-id": "<same@example.test>" };
  message.headers = headers;
  expect(spamMessageKey({ ...message, id: "moved-provider-id" })).toBe(
    spamMessageKey(message),
  );
  expect(
    spamMessageKey({ ...message, textHtml: "different content" }),
  ).not.toBe(spamMessageKey({ ...message, textHtml: "original content" }));
});
