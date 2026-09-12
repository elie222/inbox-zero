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
        if (step === 1) {
          const emailControl = observation.controls.find(
            (control) => control.type === "email",
          );
          assert.ok(emailControl);
          return {
            action: "fill_email",
            ref: emailControl.ref,
            option: null,
          };
        }
        if (step === 2) {
          assert.equal(
            await page.locator("input").inputValue(),
            "user@example.com",
          );
          const buttonControl = observation.controls.find(
            (control) => control.tag === "button",
          );
          assert.ok(buttonControl);
          return {
            action: "click",
            ref: buttonControl.ref,
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

test("collects later visible controls and select option labels", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `${"<button hidden>hidden</button>".repeat(200)}<form><label>Scope<select><option value="list-id">This list only</option><option value="all-id">All mail</option></select></label><button>Save</button></form>`,
    );
    let observed = false;
    const result = await completeUnsubscribe(
      page,
      "user@example.com",
      async (observation) => {
        if (observed) return { action: "needs_user", ref: null, option: null };
        observed = true;
        const select = observation.controls.find(
          (control) => control.tag === "select",
        );
        assert.ok(select);
        assert.deepEqual(select.options, [
          { value: "list-id", label: "This list only" },
          { value: "all-id", label: "All mail" },
        ]);
        return { action: "select", ref: select.ref, option: "list-id" };
      },
    );
    assert.equal(observed, true);
    assert.deepEqual(result, { status: "needs_user" });
    assert.equal(await page.locator("select").inputValue(), "list-id");
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
