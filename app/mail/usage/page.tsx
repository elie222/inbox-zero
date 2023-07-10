"use server";

import { Stats } from "@/components/Stats";
import { getSession } from "@/utils/auth";
import { getUsage } from "@/utils/redis/usage";

export default async function Usage() {
  const session = await getSession();
  if (!session?.user) return <div>Not logged in.</div>;

  const usage = await getUsage({ email: session.user.email });

  return (
    <div>
      <Stats
        stats={[
          {
            name: "OpenAI API Calls",
            value: usage?.openaiCalls || 0,
          },
          {
            name: "OpenAI Tokens Used",
            value: usage?.openaiTokensUsed || 0,
          },
        ]}
      />
    </div>
  );
}
