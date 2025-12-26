"use client";

import { useState } from "react";
import { Loader2Icon, RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionDescription } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { useThreads } from "@/hooks/useThreads";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { bulkProcessRulesAction } from "@/utils/actions/ai-rule";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type TimeRange = "7" | "30" | "90" | "365" | "all";

export function BulkRunRulesServerSide() {
  const { emailAccountId } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [maxEmails, setMaxEmails] = useState<number | undefined>(undefined);
  const [concurrency, setConcurrency] = useState(10);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [skipAlreadyProcessed, setSkipAlreadyProcessed] = useState(true);
  const [processOldestFirst, setProcessOldestFirst] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const { data, isLoading, error } = useThreads({ type: "inbox" });

  const { hasAiAccess, isLoading: isLoadingPremium } = usePremium();

  const handleStart = async () => {
    if (!emailAccountId) {
      toastError({
        description: "Email account ID is missing. Please refresh the page.",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const daysBack =
        timeRange === "all" ? undefined : Number.parseInt(timeRange);

      const response = await bulkProcessRulesAction(emailAccountId, {
        maxEmails,
        concurrency,
        daysBack,
        skipAlreadyProcessed,
        processOldestFirst,
      });

      if (response?.data?.success) {
        const timeDesc =
          timeRange === "all" ? "all time" : `last ${timeRange} days`;
        const limitDesc = maxEmails ? `up to ${maxEmails}` : "all";
        setResult({
          success: true,
          message: `Successfully processed ${limitDesc} emails from ${timeDesc}!`,
        });
        toastSuccess({ description: "Bulk processing completed!" });
      } else {
        const errorMessage =
          response?.serverError ||
          response?.validationErrors?.toString() ||
          "Unknown error";
        setResult({
          success: false,
          message: `Processing failed: ${errorMessage}`,
        });
        toastError({ description: errorMessage });
      }
    } catch (error) {
      console.error("Bulk processing error:", error);
      const message =
        error instanceof Error ? error.message : "An error occurred";
      setResult({ success: false, message });
      toastError({ description: message });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" Icon={RocketIcon}>
            Fast Bulk Process (Server-Side)
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fast Server-Side Bulk Processing</DialogTitle>
            <DialogDescription>
              Process emails directly on the server with true parallelism.
              Bypasses browser connection limits for much faster processing.
            </DialogDescription>
          </DialogHeader>
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <LoadingContent loading={isLoadingPremium}>
                {hasAiAccess ? (
                  <div className="flex flex-col space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeRange">Time Range</Label>
                      <Select
                        value={timeRange}
                        onValueChange={(value) =>
                          setTimeRange(value as TimeRange)
                        }
                        disabled={isProcessing}
                      >
                        <SelectTrigger id="timeRange">
                          <SelectValue placeholder="Select time range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Last 7 days</SelectItem>
                          <SelectItem value="30">Last 30 days</SelectItem>
                          <SelectItem value="90">Last 90 days</SelectItem>
                          <SelectItem value="365">Last year</SelectItem>
                          <SelectItem value="all">
                            All time (full inbox)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Choose how far back to process emails
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="maxEmails">Max Emails (optional)</Label>
                        <Input
                          id="maxEmails"
                          type="number"
                          min={1}
                          max={50_000}
                          placeholder="No limit"
                          value={maxEmails ?? ""}
                          onChange={(e) =>
                            setMaxEmails(
                              e.target.value
                                ? Number(e.target.value)
                                : undefined,
                            )
                          }
                          disabled={isProcessing}
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave empty for no limit
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="concurrency">Concurrency</Label>
                        <Input
                          id="concurrency"
                          type="number"
                          min={1}
                          max={20}
                          value={concurrency}
                          onChange={(e) =>
                            setConcurrency(Number(e.target.value) || 10)
                          }
                          disabled={isProcessing}
                        />
                        <p className="text-xs text-muted-foreground">
                          Parallel AI calls (1-20)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="skipAlreadyProcessed"
                        checked={skipAlreadyProcessed}
                        onCheckedChange={(checked) =>
                          setSkipAlreadyProcessed(checked === true)
                        }
                        disabled={isProcessing}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor="skipAlreadyProcessed"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Skip already processed emails
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Only process emails that haven&apos;t been processed
                          before. Uncheck to reprocess all emails.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="processOldestFirst"
                        checked={processOldestFirst}
                        onCheckedChange={(checked) =>
                          setProcessOldestFirst(checked === true)
                        }
                        disabled={isProcessing}
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label
                          htmlFor="processOldestFirst"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Process oldest emails first
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Within each batch, process older emails before newer
                          ones. Helps clear backlog from oldest first.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                      <strong>Tip:</strong> Server-side processing runs with
                      true parallelism (not limited by browser). With Azure AI
                      Foundry, try concurrency of 10-15 for optimal speed.
                    </div>

                    {result && (
                      <div
                        className={`rounded-md border px-3 py-2 text-sm ${
                          result.success
                            ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                            : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                        }`}
                      >
                        {result.message}
                      </div>
                    )}

                    <Button
                      type="button"
                      onClick={handleStart}
                      disabled={isProcessing || !emailAccountId}
                      className="w-full"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                          Processing on Server...
                        </>
                      ) : (
                        <>
                          <RocketIcon className="mr-2 h-4 w-4" />
                          Start Server-Side Processing
                        </>
                      )}
                    </Button>

                    {isProcessing && (
                      <SectionDescription className="text-center">
                        Processing emails server-side. This may take a few
                        minutes for large batches. You can close this dialog -
                        processing will continue on the server.
                      </SectionDescription>
                    )}
                  </div>
                ) : (
                  <PremiumAlertWithData />
                )}
              </LoadingContent>
            )}
          </LoadingContent>
        </DialogContent>
      </Dialog>
    </div>
  );
}
