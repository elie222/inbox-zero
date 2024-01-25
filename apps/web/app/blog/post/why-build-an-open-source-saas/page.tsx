import { Metadata } from "next";
import { Content } from "./content";

export const metadata: Metadata = {
  title: "Why Build An Open Source SaaS",
  description:
    "Open source SaaS products are blowing up. This is why you should consider building one.",
  alternates: {
    canonical: "/blog/why-build-an-open-source-saas",
  },
};

export default function Page() {
  return <Content />;
}
