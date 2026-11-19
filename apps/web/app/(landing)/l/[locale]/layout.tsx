import { generateLandingStaticParams } from "@/utils/i18n/landing";

// Internal route tree for translated landing pages. next.config rewrites
// /es/pricing here; only the translated languages are built.
export const dynamicParams = false;

export const generateStaticParams = generateLandingStaticParams;

export default function LocalizedLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
