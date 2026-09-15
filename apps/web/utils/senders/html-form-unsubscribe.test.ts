import { describe, expect, it } from "vitest";
import {
  encodeFormBody,
  inspectUnsubscribeHtml,
} from "./html-form-unsubscribe";

describe("inspectUnsubscribeHtml", () => {
  it("extracts a single email confirmation form", () => {
    expect(
      inspectUnsubscribeHtml({
        html: `<form action="/done" method="post">
          <input type="hidden" name="token" value="abc">
          <label>Email <input type="email" name="email"></label>
          <button type="submit" name="submit" value="1">Unsubscribe</button>
        </form>`,
        pageUrl: "https://example.com/unsub",
        recipientEmail: "user@example.com",
      }),
    ).toEqual({
      kind: "simple_form",
      pageText: expect.any(String),
      form: {
        method: "POST",
        actionUrl: "https://example.com/done",
        fields: [
          { name: "token", value: "abc" },
          { name: "email", value: "user@example.com" },
          { name: "submit", value: "1" },
        ],
      },
    });
  });

  it("rejects login, CAPTCHA, and preference-select pages", () => {
    expect(
      inspectUnsubscribeHtml({
        html: '<form><input type="password" name="password"><button>Log in</button></form>',
        pageUrl: "https://example.com/unsub",
      }).kind,
    ).toBe("unsupported");
    expect(
      inspectUnsubscribeHtml({
        html: '<form><div class="g-recaptcha"></div><button>Continue</button></form>',
        pageUrl: "https://example.com/unsub",
      }).kind,
    ).toBe("unsupported");
    expect(
      inspectUnsubscribeHtml({
        html: "<form><select name='scope'><option>This list</option></select><button>Save</button></form>",
        pageUrl: "https://example.com/unsub",
      }).kind,
    ).toBe("unsupported");
  });

  it("encodes form fields for POST", () => {
    expect(
      encodeFormBody([
        { name: "token", value: "a b" },
        { name: "email", value: "user@example.com" },
      ]),
    ).toBe("token=a+b&email=user%40example.com");
  });
});

describe("inspectUnsubscribeHtml page text", () => {
  it("leaves out copy that only lives in scripts and templates", () => {
    const result = inspectUnsubscribeHtml({
      html: `<body>
        <h1>Confirm your request</h1>
        <script>var successMessage = "You have been unsubscribed.";</script>
        <template><p>You are now unsubscribed</p></template>
        <form action="/done" method="post">
          <input type="hidden" name="token" value="abc">
          <button type="submit">Confirm</button>
        </form>
      </body>`,
      pageUrl: "https://example.com/unsub",
    });

    expect(result.kind).toBe("simple_form");
    expect(result.pageText).toContain("Confirm your request");
    expect(result.pageText).not.toContain("You have been unsubscribed");
    expect(result.pageText).not.toContain("You are now unsubscribed");
  });

  it("returns the visible text of a page with no form", () => {
    const result = inspectUnsubscribeHtml({
      html: "<body><p>You have been unsubscribed.</p></body>",
      pageUrl: "https://example.com/unsub",
    });

    expect(result.kind).toBe("unsupported");
    expect(result.pageText).toContain("You have been unsubscribed.");
  });
});

describe("inspectUnsubscribeHtml form controls", () => {
  it("does not submit an ambiguous choice of buttons", () => {
    const result = inspectUnsubscribeHtml({
      html: `<form action="/done" method="post">
        <input type="hidden" name="t" value="abc">
        <button type="submit" name="action" value="cancel">Keep subscription</button>
        <button type="submit" name="action" value="unsubscribe">Unsubscribe</button>
      </form>`,
      pageUrl: "https://example.com/unsub",
    });

    expect(result.kind).toBe("unsupported");
  });

  it("omits buttons the user never activated", () => {
    const result = inspectUnsubscribeHtml({
      html: `<form action="/done" method="post">
        <input type="hidden" name="t" value="abc">
        <button type="button" name="action" value="cancel">Cancel</button>
        <input type="button" name="dismiss" value="close">
        <button type="submit" name="action" value="unsubscribe">Unsubscribe</button>
      </form>`,
      pageUrl: "https://example.com/unsub",
    });

    expect(result).toEqual({
      kind: "simple_form",
      pageText: expect.any(String),
      form: {
        method: "POST",
        actionUrl: "https://example.com/done",
        fields: [
          { name: "t", value: "abc" },
          { name: "action", value: "unsubscribe" },
        ],
      },
    });
  });

  it("does not submit an image button it cannot send coordinates for", () => {
    expect(
      inspectUnsubscribeHtml({
        html: `<form action="/done" method="post">
          <input type="hidden" name="t" value="abc">
          <input type="image" name="go" src="go.png" value="submitted">
        </form>`,
        pageUrl: "https://example.com/unsub",
      }).kind,
    ).toBe("unsupported");
  });

  it("keeps prefilled values and only fills an empty email field", () => {
    const result = inspectUnsubscribeHtml({
      html: `<form action="/done" method="post">
        <input type="hidden" name="email_hash" value="9f8a7b">
        <input type="email" name="email" value="">
        <button type="submit">Unsubscribe</button>
      </form>`,
      pageUrl: "https://example.com/unsub",
      recipientEmail: "user@example.com",
    });

    expect(result).toEqual({
      kind: "simple_form",
      pageText: expect.any(String),
      form: {
        method: "POST",
        actionUrl: "https://example.com/done",
        fields: [
          { name: "email_hash", value: "9f8a7b" },
          { name: "email", value: "user@example.com" },
        ],
      },
    });
  });

  it("leaves an already prefilled email address alone", () => {
    const result = inspectUnsubscribeHtml({
      html: `<form action="/done" method="post">
        <input type="email" name="email" value="prefilled@example.com">
        <button type="submit">Unsubscribe</button>
      </form>`,
      pageUrl: "https://example.com/unsub",
      recipientEmail: "user@example.com",
    });

    expect(result).toEqual({
      kind: "simple_form",
      pageText: expect.any(String),
      form: {
        method: "POST",
        actionUrl: "https://example.com/done",
        fields: [{ name: "email", value: "prefilled@example.com" }],
      },
    });
  });
});
