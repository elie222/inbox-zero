import useSWR from "swr";
import { CrownIcon } from "lucide-react";
import { AlertWithButton } from "@/components/Alert";
import { Button } from "@/components/Button";
import { UserResponse } from "@/app/api/user/me/route";
import { isPremium } from "@/utils/premium";

export function usePremium() {
  const swrResponse = useSWR<UserResponse>("/api/user/me");

  return {
    ...swrResponse,
    isPremium:
      swrResponse.data && isPremium(swrResponse.data.lemonSqueezyRenewsAt),
  };
}

export function PremiumAlert() {
  return (
    <AlertWithButton
      title="Premium"
      description="This is a premium feature. Upgrade to premium or set an OpenAI API key on the settings page."
      icon={<CrownIcon className="h-4 w-4" />}
      button={<Button link={{ href: "/premium" }}>Upgrade</Button>}
    />
  );
}
