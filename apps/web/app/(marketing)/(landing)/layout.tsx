import { LemonScript } from "@/utils/scripts/lemon";

export default async function AppLayout({
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
