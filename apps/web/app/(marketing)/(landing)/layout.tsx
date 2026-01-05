import { LemonScript } from "@/utils/scripts/lemon";

export default async function MarketingLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <LemonScript />
    </>
  );
}
