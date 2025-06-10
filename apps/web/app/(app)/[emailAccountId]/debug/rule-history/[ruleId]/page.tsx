import prisma from "@/utils/prisma";
import { PageHeading } from "@/components/Typography";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

export default async function RuleHistoryPage(props: {
  params: Promise<{ emailAccountId: string; ruleId: string }>;
}) {
  const { emailAccountId, ruleId } = await props.params;
  const session = await auth();
  if (!session?.user.id) notFound();

  const rule = await prisma.rule.findFirst({
    where: {
      id: ruleId,
      // Verify the user has access to this email account
      emailAccount: {
        id: emailAccountId,
        userId: session.user.id,
      },
    },
  });
  if (!rule) notFound();

  const ruleHistory = await prisma.ruleHistory.findMany({
    where: {
      ruleId: rule.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const triggerTypeLabels: Record<string, string> = {
    ai_update: "AI Update",
    manual_update: "Manual Update",
    ai_creation: "AI Creation",
    manual_creation: "Manual Creation",
    system_creation: "System Creation",
    system_update: "System Update",
  };

  return (
    <div className="container mx-auto p-4">
      <PageHeading>Rule History: {rule.name}</PageHeading>
      {ruleHistory.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          No history found for this rule.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          {ruleHistory.map((history) => (
            <Card key={history.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    Version {history.version}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {triggerTypeLabels[history.triggerType] ||
                        history.triggerType}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(history.createdAt, {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
                {history.promptText && (
                  <CardDescription className="mt-2">
                    <strong>Prompt:</strong> {history.promptText}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h4 className="mb-1 font-semibold">Rule Details</h4>
                    <dl className="grid grid-cols-1 gap-1 text-sm">
                      <div className="flex gap-2">
                        <dt className="font-medium">Name:</dt>
                        <dd>{history.name}</dd>
                      </div>
                      {history.instructions && (
                        <div className="flex gap-2">
                          <dt className="font-medium">Instructions:</dt>
                          <dd>{history.instructions}</dd>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <dt className="font-medium">Status:</dt>
                        <dd>
                          {history.enabled ? "Enabled" : "Disabled"}
                          {history.automate && " • Automated"}
                          {history.runOnThreads && " • Runs on threads"}
                        </dd>
                      </div>
                      {history.conditionalOperator && (
                        <div className="flex gap-2">
                          <dt className="font-medium">Operator:</dt>
                          <dd>{history.conditionalOperator}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {(history.from ||
                    history.to ||
                    history.subject ||
                    history.body) && (
                    <div>
                      <h4 className="mb-1 font-semibold">Static Conditions</h4>
                      <dl className="grid grid-cols-1 gap-1 text-sm">
                        {history.from && (
                          <div className="flex gap-2">
                            <dt className="font-medium">From:</dt>
                            <dd className="font-mono">{history.from}</dd>
                          </div>
                        )}
                        {history.to && (
                          <div className="flex gap-2">
                            <dt className="font-medium">To:</dt>
                            <dd className="font-mono">{history.to}</dd>
                          </div>
                        )}
                        {history.subject && (
                          <div className="flex gap-2">
                            <dt className="font-medium">Subject:</dt>
                            <dd className="font-mono">{history.subject}</dd>
                          </div>
                        )}
                        {history.body && (
                          <div className="flex gap-2">
                            <dt className="font-medium">Body:</dt>
                            <dd className="font-mono">{history.body}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {history.categoryFilterType && (
                    <div>
                      <h4 className="mb-1 font-semibold">Category Filters</h4>
                      <p className="text-sm">
                        Type: {history.categoryFilterType}
                        {history.categoryFilters && (
                          <span className="ml-2">
                            ({(history.categoryFilters as any[]).length}{" "}
                            categories)
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {history.systemType && (
                    <div>
                      <h4 className="mb-1 font-semibold">System Type</h4>
                      <p className="text-sm">{history.systemType}</p>
                    </div>
                  )}

                  {history.actions && (
                    <div>
                      <h4 className="mb-1 font-semibold">Actions</h4>
                      <div className="space-y-1">
                        {(history.actions as any[]).map(
                          (action: any, index: number) => (
                            <div key={index} className="text-sm">
                              <Badge variant="secondary" className="mr-2">
                                {action.type}
                              </Badge>
                              {action.label && (
                                <span>Label: {action.label}</span>
                              )}
                              {action.subject && (
                                <span>Subject: {action.subject}</span>
                              )}
                              {action.content && (
                                <span>
                                  Content: {action.content.substring(0, 50)}...
                                </span>
                              )}
                              {action.to && <span>To: {action.to}</span>}
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
