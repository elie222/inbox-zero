import { Trans } from "@lingui/react/macro";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TestRulesContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/TestRules";

export function ColdEmailTest() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Trans>Test cold email blocker</Trans>
        </CardTitle>

        <CardDescription>
          <Trans>
            Check how your the cold email blocker performs against previous
            emails.
          </Trans>
        </CardDescription>
      </CardHeader>
      <TestRulesContent />
    </Card>
  );
}
