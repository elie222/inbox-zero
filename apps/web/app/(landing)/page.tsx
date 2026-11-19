import type { Metadata } from "next";
import { getHomeMetadata } from "@/app/(landing)/home/home-metadata";
import { HomePage } from "@/app/(landing)/home/HomePage";

export const metadata: Metadata = getHomeMetadata("en");

export default function NewLanding() {
  return <HomePage locale="en" />;
}
