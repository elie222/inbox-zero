export interface Payload {
  data: Data;
  meta: Meta;
}

export type EventName =
  | "order_created"
  | "order_refunded"
  | "subscription_created"
  | "subscription_updated"
  | "subscription_cancelled"
  | "subscription_resumed"
  | "subscription_expired"
  | "subscription_paused"
  | "subscription_unpaused"
  | "subscription_payment_failed"
  | "subscription_payment_success"
  | "subscription_payment_recovered"
  | "subscription_plan_changed";

export interface Meta {
  custom_data?: { user_id: string };
  event_name: EventName;
  test_mode: boolean;
}

export interface Data {
  attributes: Attributes;
  id: string;
  links: Links9;
  relationships: Relationships;
  type: string;
}

export interface Attributes {
  billing_anchor: number;
  cancelled: boolean;
  card_brand: string;
  card_last_four: string;
  created_at: string;
  customer_id: number;
  ends_at?: string;
  first_order_item?: FirstOrderItem;
  first_subscription_item?: FirstSubscriptionItem;
  order_id: number;
  order_item_id: number;
  pause: any;
  product_id: number;
  product_name: string;
  renews_at?: string;
  status: string; // on_trial, active, cancelled, past_due, paused, paid
  status_formatted: string;
  store_id: number;
  test_mode: boolean;
  // in payment success
  total_usd?: number;
  trial_ends_at?: string;
  updated_at: string;
  urls: Urls;
  user_email: string;
  user_name: string;
  variant_id: number;
  variant_name: string;
}

export interface FirstSubscriptionItem {
  created_at: string;
  id: number;
  is_usage_based: boolean;
  price_id: number;
  quantity: number;
  subscription_id: number;
  updated_at: string;
}

export interface Urls {
  update_payment_method: string;
}

export interface Relationships {
  customer: Customer;
  order: Order;
  "order-item": OrderItem;
  product: Product;
  store: Store;
  "subscription-invoices": SubscriptionInvoices;
  "subscription-items": SubscriptionItems;
  variant: Variant;
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

export interface FirstOrderItem {
  created_at: string;
  id: number;
  order_id: number;
  price: number;
  price_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  test_mode: boolean;
  updated_at: string;
  variant_id: number;
  variant_name: string;
}
