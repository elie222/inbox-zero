import { Metadata } from "next";
import { Content } from "./content";

export const metadata: Metadata = {
  title: "How to rank an open source project fist on Product Hunt - Inbox Zero",
  description: "How we finished first on Product Hunt with Inbox Zero",
  alternates: { canonical: "/product-hunt" },
};

export default function Page() {
  return <Content />;
}
