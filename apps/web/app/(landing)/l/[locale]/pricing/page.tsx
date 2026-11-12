import type { Metadata } from "next";
import { getPricingMetadata } from "@/app/(landing)/pricing/pricing-metadata";
import { PricingPage } from "@/app/(landing)/pricing/PricingPage";
import { toLocale } from "@/utils/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getPricingMetadata(toLocale(locale));
}

export default async function LocalizedPricingPage({ params }: Props) {
  const { locale } = await params;
  return <PricingPage locale={toLocale(locale)} />;
}
