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
        <CardTitle>Test Cold Email Blocker</CardTitle>

        <CardDescription>
          Check how your the cold email blocker performs against previous
          emails.
        </CardDescription>
      </CardHeader>
      <TestRulesContent />
    </Card>
  );
}
