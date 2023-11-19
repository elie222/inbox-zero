import { CrownIcon } from "lucide-react";
import { AlertWithButton } from "@/components/Alert";
import { Button } from "@/components/Button";

export function PremiumAlert() {
  return (
    <AlertWithButton
      title="Premium"
      description="This is a premium feature. Upgrade to premium."
      icon={<CrownIcon className="h-4 w-4" />}
      button={<Button link={{ href: "/premium" }}>Upgrade</Button>}
    />
  );
}
