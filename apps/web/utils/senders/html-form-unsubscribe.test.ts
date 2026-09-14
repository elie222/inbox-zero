import { describe, expect, it } from "vitest";
import {
  encodeFormBody,
  inspectUnsubscribeHtml,
  isUnsubscribeAcknowledged,
} from "./html-form-unsubscribe";

describe("isUnsubscribeAcknowledged", () => {
  it("requires a completed unsubscribe, not a form prompt", () => {
    expect(isUnsubscribeAcknowledged("Unsubscribe from this list")).toBe(false);
    expect(isUnsubscribeAcknowledged("You are not unsubscribed")).toBe(false);
    expect(isUnsubscribeAcknowledged("Click confirm to be unsubscribed")).toBe(
      false,
    );
    expect(
      isUnsubscribeAcknowledged(
        "You have been unsubscribed from Weekly Digest",
      ),
    ).toBe(true);
  });
});

describe("inspectUnsubscribeHtml", () => {
  it("treats an already-completed page as confirmed", () => {
    expect(
      inspectUnsubscribeHtml({
        html: "<p>You have been unsubscribed.</p>",
        pageUrl: "https://example.com/unsub",
      }),
    ).toEqual({ kind: "confirmed" });
  });

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
