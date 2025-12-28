import { redirect } from "next/navigation";

export default async function WrappedPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  const currentYear = new Date().getFullYear();

  // Redirect to current year
  redirect(`/${emailAccountId}/wrapped/${currentYear}`);
}
