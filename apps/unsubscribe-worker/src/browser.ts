import { chromium, type Page, type ElementHandle } from "playwright";
import {
  MAX_STEPS,
  type Decision,
  type Observation,
  type Result,
  type SandboxInput,
} from "./contracts.ts";

export async function unsubscribeInBrowser(
  input: SandboxInput,
  decide: (observation: Observation) => Promise<Decision>,
): Promise<Result> {
  const broker = new URL(input.brokerUrl);
  const browser = await chromium.launch({
    headless: true,
    chromiumSandbox: true,
    proxy: { server: broker.origin, username: "job", password: input.token },
    args: [
      `--host-resolver-rules=MAP ${broker.hostname} ${input.brokerIp}, EXCLUDE localhost`,
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  });
  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443")
      )
        await route.abort();
      else await route.continue();
    });
    await context.routeWebSocket("**/*", (socket) => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(20_000);
    context.on("page", (popup) => {
      if (popup !== page) popup.close().catch(() => {});
    });
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
    await page.goto(input.url, { waitUntil: "domcontentloaded" });
    return await completeUnsubscribe(page, input.recipientEmail, decide);
  } finally {
    await browser.close();
  }
}

export async function completeUnsubscribe(
  page: Page,
  recipientEmail: string,
  decide: (observation: Observation) => Promise<Decision>,
): Promise<Result> {
  for (let step = 0; step < MAX_STEPS; step++) {
    const { observation, handles } = await observe(page);
    try {
      const decision = await decide(observation);
      if (decision.action === "confirmed") return { status: "confirmed" };
      if (decision.action === "needs_user") return { status: "needs_user" };
      const control =
        decision.ref === null
          ? undefined
          : observation.controls.find(({ ref }) => ref === decision.ref);
      const handle = decision.ref === null ? undefined : handles[decision.ref];
      if (!handle || !control) return { status: "needs_user" };
      if (decision.action === "fill_email") {
        if (
          control.tag !== "input" ||
          !["email", "text"].includes(control.type)
        )
          return { status: "needs_user" };
        await handle.fill(recipientEmail);
      } else if (decision.action === "select") {
        if (
          control.tag !== "select" ||
          !decision.option ||
          !control.options.some((option) => option.value === decision.option)
        )
          return { status: "needs_user" };
        await handle.selectOption(decision.option);
      } else {
        await handle.click();
      }
      await page.waitForLoadState("domcontentloaded");
    } finally {
      await Promise.allSettled(handles.map((handle) => handle.dispose()));
    }
  }
  return { status: "needs_user" };
}

async function observe(page: Page) {
  const candidates = await page.evaluateHandle(() =>
    Array.from(
      document.querySelectorAll(
        "a,button,input,select,[role=button],[role=checkbox]",
      ),
    ),
  );
  const properties = await candidates.getProperties();
  const all = [...properties.values()].flatMap((value) => {
    const element = value.asElement();
    return element ? [element] : [];
  });
  await candidates.dispose();
  const handles: ElementHandle<HTMLElement | SVGElement>[] = [];
  const controls: Observation["controls"] = [];
  for (const handle of all) {
    if (handles.length >= 200 || !(await handle.isVisible())) {
      await handle.dispose();
      continue;
    }
    const details = await handle.evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      type: (element.getAttribute("type") || "text").slice(0, 30),
      label: (
        element.getAttribute("aria-label") ||
        (element instanceof HTMLInputElement
          ? Array.from(element.labels ?? [])
              .map((label) => label.innerText)
              .join(" ") || element.placeholder
          : element.textContent) ||
        ""
      ).slice(0, 400),
      options:
        element instanceof HTMLSelectElement
          ? Array.from(element.options)
              .slice(0, 100)
              .map((option) => ({
                value: option.value.slice(0, 300),
                label: option.label.slice(0, 300),
              }))
          : [],
    }));
    controls.push({ ref: handles.length, ...details });
    handles.push(handle);
  }
  return {
    handles,
    observation: {
      text: await page.evaluate(() => document.body.innerText.slice(0, 16_000)),
      controls,
    },
  };
}
