"use client";

import { useRules } from "@/hooks/useRules";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { prefixPath } from "@/utils/path";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingContent } from "@/components/LoadingContent";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function RuleHistorySelectPage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useRules();

  if (isLoading) {
    return (
      <LoadingContent loading={isLoading}>Loading rules...</LoadingContent>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4">
        <PageHeading>Rule History</PageHeading>
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Error loading rules: {error.error || "Unknown error"}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const rules = data || [];

  return (
    <div className="container mx-auto p-4">
      <PageHeading>Select Rule to View History</PageHeading>

      {rules.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No rules found.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{rule.name}</CardTitle>
                  <div className="flex gap-2">
                    {rule.systemType && (
                      <Badge variant="secondary">{rule.systemType}</Badge>
                    )}
                    {!rule.enabled && <Badge variant="outline">Disabled</Badge>}
                  </div>
                </div>
                {rule.instructions && (
                  <CardDescription className="mt-2">
                    {rule.instructions}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <Button asChild>
                  <Link
                    href={prefixPath(
                      emailAccountId,
                      `/debug/rule-history/${rule.id}`,
                    )}
                  >
                    View History
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
