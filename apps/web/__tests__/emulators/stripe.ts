import crypto from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A local stand-in for Stripe's API, hosted checkout page, and webhook
 * delivery, in the spirit of `@inbox-zero/emulate` but kept in-repo.
 *
 * It is stateful rather than a mock: checkout sessions become subscriptions,
 * trials end into invoices that can succeed or fail, and every state change is
 * delivered to the app as a signed webhook. That is enough to drive the whole
 * signup -> checkout -> trial -> first payment path through a real browser and
 * the real `stripe` SDK.
 *
 * Fidelity caveat: the payload shapes here are our reading of Stripe's API, so
 * this catches regressions in our own billing code, not a misreading of theirs.
 * Update it from real Stripe payloads whenever we learn something new.
 */

// Deliberately not Stripe-shaped: a real-looking prefix trips secret
// scanners, and the emulator only compares this value with itself.
const DEFAULT_SECRET_KEY = "emulator-stripe-key";
const DEFAULT_WEBHOOK_SECRET = "whsec_emulator";
const DEFAULT_UNIT_AMOUNT = 2000;
const BILLING_PERIOD_SECONDS = 30 * 24 * 60 * 60;

type PriceDefinition = {
  currency: string;
  interval: "month" | "year";
  productId: string;
  unitAmount: number;
};

type StripeObject = Record<string, unknown>;

export type StripeEmulatorPaymentOutcome = "paid" | "failed";

export interface StripeEmulatorOptions {
  port?: number;
  secretKey?: string;
  webhookSecret?: string;
  /** Where signed webhooks are delivered, e.g. `${baseUrl}/api/stripe/webhook`. */
  webhookUrl?: string;
}

export interface StripeEmulator {
  close(): Promise<void>;
  /**
   * Ends a trial the way Stripe does: the subscription flips to `active`
   * first, and only then does the first real invoice succeed or fail.
   */
  endTrial(
    subscriptionId: string,
    outcome: StripeEmulatorPaymentOutcome,
  ): Promise<void>;
  /** Drops all customers, sessions and subscriptions. Webhooks keep working. */
  reset(): void;
  secretKey: string;
  url: string;
  webhookSecret: string;
}

export async function createStripeEmulator(
  options: StripeEmulatorOptions = {},
): Promise<StripeEmulator> {
  const secretKey = options.secretKey ?? DEFAULT_SECRET_KEY;
  const webhookSecret = options.webhookSecret ?? DEFAULT_WEBHOOK_SECRET;
  const webhookUrl = options.webhookUrl;

  const customers = new Map<string, StripeObject>();
  const sessions = new Map<string, StripeObject>();
  const subscriptions = new Map<string, StripeObject>();
  const invoices = new Map<string, StripeObject>();
  const idempotentResponses = new Map<string, StripeObject>();
  let sequence = 0;

  const nextId = (prefix: string) =>
    `${prefix}_${++sequence}${crypto.randomBytes(4).toString("hex")}`;

  function reset() {
    customers.clear();
    sessions.clear();
    subscriptions.clear();
    invoices.clear();
    idempotentResponses.clear();
  }

  async function deliver(
    type: string,
    object: StripeObject,
    previousAttributes?: StripeObject,
  ) {
    if (!webhookUrl) return;

    const event = {
      id: nextId("evt"),
      object: "event",
      api_version: "2025-01-01",
      created: nowSeconds(),
      type,
      data: {
        object,
        ...(previousAttributes
          ? { previous_attributes: previousAttributes }
          : {}),
      },
    };
    const payload = JSON.stringify(event);
    const timestamp = nowSeconds();
    const signature = crypto
      .createHmac("sha256", webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(
        `Stripe emulator webhook ${type} was rejected with ${response.status}`,
      );
    }
  }

  function buildSubscription(session: StripeObject): StripeObject {
    const lineItem = (session.line_items as StripeObject[])[0];
    const priceId = String(lineItem.price);
    const price = describePrice(priceId);
    const created = nowSeconds();
    const trialDays = Number(
      (session.subscription_data as StripeObject | undefined)
        ?.trial_period_days ?? 0,
    );
    const isTrialing = trialDays > 0;
    const periodEnd = created + BILLING_PERIOD_SECONDS;

    return {
      id: nextId("sub"),
      object: "subscription",
      customer: session.customer,
      created,
      status: isTrialing ? "trialing" : "active",
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      ended_at: null,
      trial_start: isTrialing ? created : null,
      trial_end: isTrialing ? created + trialDays * 24 * 60 * 60 : null,
      default_payment_method: {
        id: nextId("pm"),
        object: "payment_method",
        type: "card",
      },
      latest_invoice: null,
      metadata:
        (session.subscription_data as StripeObject | undefined)?.metadata ?? {},
      items: {
        object: "list",
        has_more: false,
        url: "/v1/subscription_items",
        data: [
          {
            id: nextId("si"),
            object: "subscription_item",
            quantity: Number(lineItem.quantity ?? 1),
            current_period_start: created,
            current_period_end: periodEnd,
            price: {
              id: priceId,
              object: "price",
              currency: price.currency,
              product: price.productId,
              unit_amount: price.unitAmount,
              recurring: { interval: price.interval },
            },
          },
        ],
      },
    };
  }

  function buildInvoice(
    subscription: StripeObject,
    total: number,
    status: string,
    billingReason: string,
  ): StripeObject {
    const created = nowSeconds();
    const item = (subscription.items as StripeObject).data as StripeObject[];
    const price = item[0].price as StripeObject;

    return {
      id: nextId("in"),
      object: "invoice",
      customer: subscription.customer,
      created,
      currency: price.currency,
      total,
      amount_due: total,
      amount_paid: status === "paid" ? total : 0,
      status,
      billing_reason: billingReason,
      total_taxes: [],
      status_transitions: {
        finalized_at: created,
        paid_at: status === "paid" ? created : null,
      },
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: subscription.id },
      },
    };
  }

  async function completeCheckout(session: StripeObject) {
    const subscription = buildSubscription(session);
    subscriptions.set(String(subscription.id), subscription);

    session.status = "complete";
    session.subscription = subscription.id;

    // Stripe raises a zero-amount invoice when a trial starts. Keeping it here
    // is what lets tests prove that a free trial invoice is never mistaken for
    // a paid conversion.
    const firstInvoice = buildInvoice(
      subscription,
      subscription.trial_end ? 0 : invoiceTotal(subscription),
      "paid",
      "subscription_create",
    );
    invoices.set(String(firstInvoice.id), firstInvoice);
    subscription.latest_invoice = firstInvoice.id;

    await deliver("checkout.session.completed", session);
    await deliver("customer.subscription.created", subscription);
    await deliverPaidInvoice(firstInvoice);

    return subscription;
  }

  // Stripe emits both for a collected invoice, and our billing code keys trial
  // conversion off payment_succeeded specifically.
  async function deliverPaidInvoice(invoice: StripeObject) {
    await deliver("invoice.paid", invoice);
    await deliver("invoice.payment_succeeded", invoice);
  }

  async function endTrial(
    subscriptionId: string,
    outcome: StripeEmulatorPaymentOutcome,
  ) {
    const subscription = subscriptions.get(subscriptionId);
    if (!subscription)
      throw new Error(`Unknown subscription ${subscriptionId}`);

    subscription.trial_end = nowSeconds() - 1;
    subscription.status = "active";
    await deliver("customer.subscription.updated", subscription, {
      status: "trialing",
    });

    const invoice = buildInvoice(
      subscription,
      invoiceTotal(subscription),
      outcome === "paid" ? "paid" : "open",
      "subscription_cycle",
    );
    invoices.set(String(invoice.id), invoice);
    subscription.latest_invoice = invoice.id;

    if (outcome === "paid") {
      await deliverPaidInvoice(invoice);
      return;
    }

    await deliver("invoice.payment_failed", invoice);
    subscription.status = "past_due";
    await deliver("customer.subscription.updated", subscription, {
      status: "active",
    });
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error) => {
      respondJson(response, 500, { error: { message: String(error) } });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://stripe.emulator");
    const body = await readBody(request);
    const path = url.pathname;

    if (path === "/health") return respondJson(response, 200, { ok: true });

    if (path.startsWith("/v1/")) {
      if (request.headers.authorization !== `Bearer ${secretKey}`) {
        return respondJson(response, 401, {
          error: { message: "Invalid API key", type: "invalid_request_error" },
        });
      }

      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey === "string" && request.method === "POST") {
        const cached = idempotentResponses.get(idempotencyKey);
        if (cached) return respondJson(response, 200, cached);
      }

      const result = await handleApi({
        method: request.method ?? "GET",
        path,
        query: url.searchParams,
        params: parseForm(body),
      });

      if (!result) {
        return respondJson(response, 404, {
          error: {
            message: `The Stripe emulator does not implement ${request.method} ${path}`,
            type: "invalid_request_error",
          },
        });
      }

      if (typeof idempotencyKey === "string" && request.method === "POST") {
        idempotentResponses.set(idempotencyKey, result);
      }
      return respondJson(response, 200, result);
    }

    // Hosted checkout: the page the browser is redirected to.
    const checkoutMatch = /^\/checkout\/([^/]+)(\/complete)?$/.exec(path);
    if (checkoutMatch) {
      const session = sessions.get(checkoutMatch[1]);
      if (!session)
        return respondText(response, 404, "Unknown checkout session");

      if (!checkoutMatch[2]) {
        return respondHtml(response, 200, renderCheckoutPage(session));
      }

      const subscription = await completeCheckout(session);
      const successUrl = String(session.success_url).replace(
        "{CHECKOUT_SESSION_ID}",
        String(session.id),
      );
      response.writeHead(303, { location: successUrl });
      response.end(String(subscription.id));
      return;
    }

    // Test control surface, so specs can drive Stripe-side events over HTTP.
    if (path === "/__emulator/reset" && request.method === "POST") {
      reset();
      return respondJson(response, 200, { ok: true });
    }

    const endTrialMatch =
      /^\/__emulator\/subscriptions\/([^/]+)\/end-trial$/.exec(path);
    if (endTrialMatch && request.method === "POST") {
      const outcome = (JSON.parse(body || "{}") as { outcome?: string })
        .outcome;
      if (outcome !== "paid" && outcome !== "failed") {
        return respondJson(response, 400, {
          error: { message: "outcome must be 'paid' or 'failed'" },
        });
      }
      await endTrial(endTrialMatch[1], outcome);
      return respondJson(response, 200, { ok: true });
    }

    return respondText(response, 404, "Not found");
  }

  async function handleApi({
    method,
    path,
    query,
    params,
  }: {
    method: string;
    path: string;
    query: URLSearchParams;
    params: StripeObject;
  }): Promise<StripeObject | null> {
    if (path === "/v1/customers" && method === "POST") {
      const customer = {
        id: nextId("cus"),
        object: "customer",
        balance: 0,
        deleted: false,
        email: params.email ?? null,
        metadata: params.metadata ?? {},
      };
      customers.set(String(customer.id), customer);
      return customer;
    }

    if (path === "/v1/checkout/sessions" && method === "POST") {
      const session: StripeObject = {
        id: nextId("cs_test"),
        object: "checkout.session",
        customer: params.customer,
        mode: params.mode ?? "subscription",
        status: "open",
        success_url: params.success_url,
        cancel_url: params.cancel_url,
        line_items: params.line_items ?? [],
        subscription: null,
        subscription_data: params.subscription_data ?? {},
        metadata: params.metadata ?? {},
      };
      session.url = `${baseUrl()}/checkout/${session.id}`;
      sessions.set(String(session.id), session);
      return session;
    }

    if (path === "/v1/billing_portal/sessions" && method === "POST") {
      return {
        id: nextId("bps"),
        object: "billing_portal.session",
        customer: params.customer,
        url: `${baseUrl()}/billing-portal/${params.customer}`,
      };
    }

    if (path === "/v1/subscriptions" && method === "GET") {
      const customerId = query.get("customer");
      const data = [...subscriptions.values()]
        .filter((subscription) => subscription.customer === customerId)
        .sort((left, right) => Number(right.created) - Number(left.created))
        .slice(0, Number(query.get("limit") ?? 10));
      return {
        object: "list",
        has_more: false,
        url: "/v1/subscriptions",
        data,
      };
    }

    const customerMatch = /^\/v1\/customers\/([^/]+)$/.exec(path);
    if (customerMatch && method === "GET") {
      return customers.get(customerMatch[1]) ?? null;
    }

    const sessionMatch = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
    if (sessionMatch && method === "GET") {
      return sessions.get(sessionMatch[1]) ?? null;
    }

    const subscriptionMatch = /^\/v1\/subscriptions\/([^/]+)$/.exec(path);
    if (subscriptionMatch) {
      const subscription = subscriptions.get(subscriptionMatch[1]);
      if (!subscription) return null;
      if (method === "GET") return subscription;
      if (method === "POST") {
        if (params.trial_end === "now") {
          await endTrial(String(subscription.id), "paid");
        }
        if (params.cancel_at_period_end !== undefined) {
          subscription.cancel_at_period_end =
            params.cancel_at_period_end === "true";
        }
        return subscription;
      }
    }

    const subscriptionItemMatch = /^\/v1\/subscription_items\/([^/]+)$/.exec(
      path,
    );
    if (subscriptionItemMatch) {
      const item = findSubscriptionItem(subscriptionItemMatch[1]);
      if (!item) return null;
      if (method === "GET") return item;
      if (method === "POST") {
        if (params.quantity !== undefined) {
          item.quantity = Number(params.quantity);
        }
        return item;
      }
    }

    if (path === "/v1/invoices" && method === "GET") {
      const customerId = query.get("customer");
      const status = query.get("status");
      const data = [...invoices.values()]
        .filter((invoice) => invoice.customer === customerId)
        .filter((invoice) => !status || invoice.status === status)
        .sort((left, right) => Number(right.created) - Number(left.created))
        .slice(0, Number(query.get("limit") ?? 10));
      return { object: "list", has_more: false, url: "/v1/invoices", data };
    }

    const invoiceMatch = /^\/v1\/invoices\/([^/]+)$/.exec(path);
    if (invoiceMatch && method === "GET") {
      return invoices.get(invoiceMatch[1]) ?? null;
    }

    return null;
  }

  function findSubscriptionItem(itemId: string) {
    for (const subscription of subscriptions.values()) {
      const items = (subscription.items as StripeObject).data as StripeObject[];
      const item = items.find((candidate) => candidate.id === itemId);
      if (item) return item;
    }
    return null;
  }

  function baseUrl() {
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
  }

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });

  return {
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    endTrial,
    reset,
    secretKey,
    url: baseUrl(),
    webhookSecret,
  };
}

function invoiceTotal(subscription: StripeObject) {
  const item = ((subscription.items as StripeObject).data as StripeObject[])[0];
  const price = item.price as StripeObject;
  return Number(price.unit_amount) * Number(item.quantity ?? 1);
}

function describePrice(priceId: string): PriceDefinition {
  const isAnnual = /annual|year/i.test(priceId);
  return {
    currency: "usd",
    interval: isAnnual ? "year" : "month",
    productId: `prod_${crypto.createHash("sha256").update(priceId).digest("hex").slice(0, 16)}`,
    unitAmount: DEFAULT_UNIT_AMOUNT,
  };
}

function renderCheckoutPage(session: StripeObject) {
  const lineItem = (session.line_items as StripeObject[])[0];
  const trialDays = Number(
    (session.subscription_data as StripeObject | undefined)
      ?.trial_period_days ?? 0,
  );

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Stripe emulator checkout</title></head>
  <body>
    <h1>Stripe emulator checkout</h1>
    <p>Price: ${escapeHtml(String(lineItem?.price ?? "unknown"))}</p>
    <p>Quantity: ${escapeHtml(String(lineItem?.quantity ?? 1))}</p>
    <p>Trial days: ${trialDays}</p>
    <form method="post" action="/checkout/${escapeHtml(String(session.id))}/complete">
      <button type="submit">Pay and subscribe</button>
    </form>
    <a href="${escapeHtml(String(session.cancel_url))}">Back</a>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character] ?? character;
  });
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

/** Rebuilds the nested objects behind Stripe's `a[b][0][c]=value` form encoding. */
function parseForm(body: string): StripeObject {
  const result: StripeObject = {};

  for (const [key, value] of new URLSearchParams(body)) {
    const [root, ...rest] = key.split("[");
    const segments = [
      root,
      ...rest.map((segment) => segment.replaceAll("]", "")),
    ];
    let target: Record<string, unknown> | unknown[] = result;

    for (const [index, segment] of segments.entries()) {
      const isLast = index === segments.length - 1;
      const nextSegment = segments[index + 1];
      const container = Array.isArray(target)
        ? (target as unknown[])
        : (target as Record<string, unknown>);
      const accessor = Array.isArray(target) ? Number(segment) : segment;

      if (isLast) {
        (container as Record<string | number, unknown>)[accessor] = value;
        continue;
      }

      const existing = (container as Record<string | number, unknown>)[
        accessor
      ];
      if (existing === undefined) {
        const created = /^\d+$/.test(nextSegment) ? [] : {};
        (container as Record<string | number, unknown>)[accessor] = created;
        target = created;
        continue;
      }
      target = existing as Record<string, unknown> | unknown[];
    }
  }

  return result;
}

function respondJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function respondHtml(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function respondText(response: ServerResponse, status: number, body: string) {
  response.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  response.end(body);
}
