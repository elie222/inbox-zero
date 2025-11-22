import { LemonScript } from "@/utils/scripts/lemon";

export default async function LandingLayout({
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
