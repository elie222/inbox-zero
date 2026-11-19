import type { Metadata } from "next";
import { getHomeMetadata } from "@/app/(landing)/home/home-metadata";
import HomePage from "@/app/(landing)/page";

// The home page for signed-in visitors, whom next.config sends from "/" to the
// app. Same page as "/", so it points search engines there.
export const metadata: Metadata = getHomeMetadata("en");

export default HomePage;
