"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getUsage } from "@/utils/redis/usage";
import { TopSection } from "@/components/TopSection";
import { NotLoggedIn } from "@/components/ErrorDisplay";
import { Usage } from "@/app/(app)/usage/usage";

export default async function UsagePage() {
  const session = await auth();
  if (!session?.user.email) return <NotLoggedIn />;

  const usage = await getUsage({ email: session.user.email });

  return (
    <div>
      <TopSection title="Credits and Usage" />
      <div className="m-4">
        <Usage usage={usage} />
      </div>
    </div>
  );
}
