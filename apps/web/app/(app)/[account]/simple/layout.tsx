import { SimpleEmailStateProvider } from "@/app/(app)/[account]/simple/SimpleProgressProvider";

export default async function SimpleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SimpleEmailStateProvider>{children}</SimpleEmailStateProvider>;
}
