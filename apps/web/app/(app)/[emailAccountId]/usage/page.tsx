import { getUsage } from "@/utils/redis/usage";
import { TopSection } from "@/components/TopSection";
import { Usage } from "@/app/(app)/[emailAccountId]/usage/usage";
import prisma from "@/utils/prisma";

export default async function UsagePage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const params = await props.params;
  const emailAccountId = params.emailAccountId;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { email: true },
  });

  if (!emailAccount) return <p>Email account not found</p>;

  const usage = await getUsage({ email: emailAccount.email });

  return (
    <div>
      <TopSection title="Credits and Usage" />
      <div className="m-4">
        <Usage usage={usage} />
      </div>
    </div>
  );
}
