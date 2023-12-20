import crypto from "crypto";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env.mjs";
import { posthogCaptureEvent } from "@/utils/posthog";

// https://docs.lemonsqueezy.com/help/webhooks#signing-requests
// https://gist.github.com/amosbastian/e403e1d8ccf4f7153f7840dd11a85a69
export const POST = withError(async (request: Request) => {
  const text = await request.text();
  const hmac = crypto.createHmac("sha256", env.LEMON_SQUEEZY_SIGNING_SECRET);
  const digest = Buffer.from(hmac.update(text).digest("hex"), "utf8");
  const signature = Buffer.from(
    request.headers.get("x-signature") as string,
    "utf8",
  );

  if (!crypto.timingSafeEqual(digest, signature))
    return new Response("Invalid signature.", { status: 400 });

  const payload: Payload = JSON.parse(text);

  const userId = payload.meta.custom_data?.user_id;

  // Check if custom defined data i.e. the `userId` is there or not
  if (!userId) {
    return NextResponse.json(
      { message: "No userId provided" },
      { status: 403 },
    );
  }

  if (payload.meta.event_name === "subscription_created") {
    const lemonSqueezySubscriptionId = payload.data.id;
    const lemonSqueezyCustomerId = payload.data.attributes.customer_id;

    const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

    const lemonSqueezyRenewsAt =
      lemonSqueezySubscriptionId === env.NEXT_PUBLIC_LIFETIME_PLAN_ID
        ? new Date(Date.now() + TEN_YEARS)
        : payload.data.attributes.renews_at
          ? new Date(payload.data.attributes.renews_at)
          : undefined;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        lemonSqueezyRenewsAt,
        lemonSqueezySubscriptionId,
        lemonSqueezyCustomerId,
      },
      select: { email: true },
    });

    if (updatedUser.email) {
      await posthogCaptureEvent(
        updatedUser.email,
        "Upgraded to premium",
        payload.data.attributes,
      );
    }
  } else if (payload.meta.event_name === "subscription_payment_success") {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        lemonSqueezyRenewsAt: payload.data.attributes.renews_at
          ? new Date(payload.data.attributes.renews_at)
          : undefined,
      },
      select: { email: true },
    });

    if (updatedUser.email) {
      await posthogCaptureEvent(
        updatedUser.email,
        "Premium subscription payment success",
        payload.data.attributes,
      );
    }
  } else if (payload.data.attributes.ends_at) {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        lemonSqueezyRenewsAt: payload.data.attributes.ends_at,
      },
      select: { email: true },
    });

    if (updatedUser.email) {
      await posthogCaptureEvent(
        updatedUser.email,
        "Cancelled premium subscription",
        payload.data.attributes,
      );
    }
  }

  return NextResponse.json({ ok: true });
});

export interface Payload {
  meta: Meta;
  data: Data;
}

type EventName =
  | "order_created"
  | "order_refunded"
  | "subscription_created"
  | "subscription_cancelled"
  | "subscription_resumed"
  | "subscription_expired"
  | "subscription_paused"
  | "subscription_unpaused"
  | "subscription_payment_failed"
  | "subscription_payment_success"
  | "subscription_payment_recovered";

export interface Meta {
  test_mode: boolean;
  event_name: EventName;
  custom_data?: { user_id: string };
}

export interface Data {
  type: string;
  id: string;
  attributes: Attributes;
  relationships: Relationships;
  links: Links9;
}

export interface Attributes {
  store_id: number;
  customer_id: number;
  order_id: number;
  order_item_id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  user_name: string;
  user_email: string;
  status: string;
  status_formatted: string;
  card_brand: string;
  card_last_four: string;
  pause: any;
  cancelled: boolean;
  trial_ends_at: any;
  billing_anchor: number;
  first_subscription_item: FirstSubscriptionItem;
  urls: Urls;
  renews_at?: string;
  ends_at?: string;
  created_at: string;
  updated_at: string;
  test_mode: boolean;
}

export interface FirstSubscriptionItem {
  id: number;
  subscription_id: number;
  price_id: number;
  quantity: number;
  is_usage_based: boolean;
  created_at: string;
  updated_at: string;
}

export interface Urls {
  update_payment_method: string;
}

export interface Relationships {
  store: Store;
  customer: Customer;
  order: Order;
  "order-item": OrderItem;
  product: Product;
  variant: Variant;
  "subscription-items": SubscriptionItems;
  "subscription-invoices": SubscriptionInvoices;
}

export interface Store {
  links: Links;
}

export interface Links {
  related: string;
  self: string;
}

export interface Customer {
  links: Links2;
}

export interface Links2 {
  related: string;
  self: string;
}

export interface Order {
  links: Links3;
}

export interface Links3 {
  related: string;
  self: string;
}

export interface OrderItem {
  links: Links4;
}

export interface Links4 {
  related: string;
  self: string;
}

export interface Product {
  links: Links5;
}

export interface Links5 {
  related: string;
  self: string;
}

export interface Variant {
  links: Links6;
}

export interface Links6 {
  related: string;
  self: string;
}

export interface SubscriptionItems {
  links: Links7;
}

export interface Links7 {
  related: string;
  self: string;
}

export interface SubscriptionInvoices {
  links: Links8;
}

export interface Links8 {
  related: string;
  self: string;
}

export interface Links9 {
  self: string;
}
