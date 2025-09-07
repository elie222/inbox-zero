import type { Metadata } from "next";
import { HeroHome } from "@/app/(landing)/home/Hero";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { ContentLayout } from "@/app/(landing)/home/ContentLayout";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <BasicLayout>
      <HeroHome />
      <ContentLayout />
    </BasicLayout>
  );
}
