import { getUsage } from "@/utils/redis/usage";
import { TopSection } from "@/components/TopSection";
import { Usage } from "@/app/(app)/[account]/usage/usage";
import prisma from "@/utils/prisma";

export default async function UsagePage(props: {
  params: Promise<{ account: string }>;
}) {
  const params = await props.params;
  const accountId = params.account;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { accountId },
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
