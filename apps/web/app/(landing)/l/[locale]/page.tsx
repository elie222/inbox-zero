import type { Metadata } from "next";
import { HomePage } from "@/app/(landing)/home/HomePage";
import { getHomeMetadata } from "@/app/(landing)/home/home-metadata";
import { toLocale } from "@/utils/i18n/locales";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  return getHomeMetadata(toLocale(locale));
}

export default async function LocalizedHomePage({ params }: Props) {
  const { locale } = await params;
  return <HomePage locale={toLocale(locale)} />;
}
