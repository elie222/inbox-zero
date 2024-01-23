import { Metadata } from "next";
import { Content } from "./content";

export const metadata: Metadata = {
  title: "How my Open Source SaaS hit #1 on Product Hunt",
  description:
    "My open source app finished first place on Product Hunt. This is how I did it.",
  alternates: {
    canonical: "/blog/how-my-open-source-saas-hit-first-on-product-hunt",
  },
};

export default function Page() {
  return <Content />;
}
