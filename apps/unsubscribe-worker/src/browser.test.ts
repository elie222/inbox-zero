import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { completeUnsubscribe } from "./browser.ts";

test("completes an email confirmation form and observes its resulting state", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<form><label>Email<input type="email" required></label><button>Unsubscribe</button></form>
      <script>document.querySelector('form').onsubmit = event => { event.preventDefault(); document.body.textContent = 'Subscription removed'; };</script>`);
    let step = 0;
    const result = await completeUnsubscribe(
      page,
      "user@example.com",
      async (observation) => {
        step++;
        if (step === 1)
          return {
            action: "fill_email",
            ref: observation.controls.find(
              (control) => control.type === "email",
            )!.ref,
            option: null,
          };
        if (step === 2) {
          assert.equal(
            await page.locator("input").inputValue(),
            "user@example.com",
          );
          return {
            action: "click",
            ref: observation.controls.find(
              (control) => control.tag === "button",
            )!.ref,
            option: null,
          };
        }
        assert.equal(observation.text, "Subscription removed");
        return { action: "confirmed", ref: null, option: null };
      },
    );
    assert.deepEqual(result, { status: "confirmed" });
    await page.screenshot({
      path: new URL(
        "../../../.context/unsubscribe-audit/browser-confirmed.png",
        import.meta.url,
      ).pathname,
    });
  } finally {
    await browser.close();
  }
});

test("does not type recipient data into password fields or invent a missing control", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<label>Password<input type="password"></label>');
    const result = await completeUnsubscribe(
      page,
      "user@example.com",
      async () => ({ action: "fill_email", ref: 0, option: null }),
    );
    assert.deepEqual(result, { status: "needs_user" });
    assert.equal(await page.locator("input").inputValue(), "");
    const missing = await completeUnsubscribe(
      page,
      "user@example.com",
      async () => ({ action: "click", ref: 100, option: null }),
    );
    assert.deepEqual(missing, { status: "needs_user" });
  } finally {
    await browser.close();
  }
});
