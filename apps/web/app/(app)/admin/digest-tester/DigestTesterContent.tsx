"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useSWR from "swr";
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Monitor,
  Smartphone,
} from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import DigestEmail from "@inboxzero/resend/emails/digest";
import type { DigestEmailProps } from "@inboxzero/resend/emails/digest";

type TestEmail = {
  messageId: string;
  from: string;
  subject: string;
  date: string;
};

type ProcessResult = {
  testRunId: string;
  stats: {
    totalEmails: number;
    rulesMatched?: number;
    enqueued?: number;
    processingTimeMs: number;
  };
  results: Array<{
    messageId: string;
    matched?: boolean;
    ruleName?: string;
    enqueued?: boolean;
    error?: string;
  }>;
  pendingDigests: number;
  digestItems?: number;
  message: string;
};

export function DigestTesterContent() {
  const [emailInput, setEmailInput] = useState<string>("");
  const [emailAccountId, setEmailAccountId] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(
    null,
  );
  const [currentPrompt, setCurrentPrompt] = useState<string>("");
  const [customLabel, setCustomLabel] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">(
    "desktop",
  );

  // Fetch test emails with label
  const {
    data: emailsData,
    isLoading: emailsLoading,
    mutate: mutateEmails,
  } = useSWR(
    emailAccountId
      ? `/api/admin/digest-tester/emails?emailAccountId=${emailAccountId}${customLabel ? `&label=${encodeURIComponent(customLabel)}` : ""}`
      : null,
  );

  // Fetch previous test runs
  const { data: runsData, mutate: mutateRuns } = useSWR(
    emailAccountId
      ? `/api/admin/digest-tester/runs?emailAccountId=${emailAccountId}`
      : null,
  );

  // Fetch current prompt
  useSWR("/api/admin/digest-tester/prompt", {
    onSuccess: (data) => setCurrentPrompt(data.prompt),
  });

  // Fetch preview data
  const {
    data: previewData,
    isLoading: previewLoading,
    mutate: mutatePreview,
  } = useSWR<DigestEmailProps & { empty?: boolean; message?: string }>(
    emailAccountId
      ? `/api/admin/digest-tester/preview?emailAccountId=${emailAccountId}`
      : null,
  );

  const testEmails = emailsData?.emails || [];
  const _previousRuns = runsData?.runs || [];

  // Debug: log the response
  if (emailsData) {
    console.log("Email data received:", emailsData);
  }

  const handleProcess = async () => {
    if (!emailAccountId || testEmails.length === 0) return;

    setProcessing(true);
    setProcessResult(null);

    try {
      const response = await fetch("/api/admin/digest-tester/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAccountId,
          messageIds: testEmails.map((e: TestEmail) => e.messageId),
        }),
      });

      if (!response.ok) throw new Error("Failed to process emails");

      const result = await response.json();
      setProcessResult(result);
      mutateRuns();
      mutatePreview(); // Refresh preview

      toastSuccess({
        title: "Emails processed",
        description: result.message,
      });
    } catch (error) {
      toastError({
        title: "Error processing emails",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSendDigest = async () => {
    if (!emailAccountId) return;

    setSending(true);

    try {
      const response = await fetch("/api/admin/digest-tester/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAccountId }),
      });

      if (!response.ok) throw new Error("Failed to send digest");

      const _result = await response.json();

      toastSuccess({
        title: "Digest sent!",
        description: "Check your inbox for the digest email",
      });

      // Refresh preview after sending (digests remain PENDING in test mode)
      mutatePreview();
    } catch (error) {
      toastError({
        title: "Error sending digest",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-8">
      {/* Top: Setup */}
      <Card className="p-6 mb-6 bg-blue-50 border-blue-200">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">How to Use</h3>
            <ol className="text-sm space-y-1 ml-4 list-decimal">
              <li>Enter your email below</li>
              <li>In Gmail: Label test emails</li>
              <li>Enter label name</li>
              <li>Process & Send digest</li>
              <li>Modify prompt, repeat</li>
            </ol>
          </div>
          <div>
            <Label htmlFor="email-input" className="text-sm font-medium">
              Your Email Address
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="email-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="your@email.com"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `/api/admin/digest-tester/email-account?email=${encodeURIComponent(emailInput)}`,
                    );
                    const data = await res.json();
                    if (data.id) {
                      setEmailAccountId(data.id);
                      mutateEmails();
                      toastSuccess({
                        title: "Account loaded",
                        description: `Found account for ${data.email}`,
                      });
                    } else {
                      toastError({
                        title: "Not found",
                        description: data.error || "Email account not found",
                      });
                    }
                  } catch (_e) {
                    toastError({
                      title: "Error",
                      description: "Failed to find email account",
                    });
                  }
                }}
                disabled={!emailInput}
              >
                Load
              </Button>
            </div>
            {emailAccountId && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Loaded: {emailAccountId.substring(0, 12)}...
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="label-input" className="text-sm font-medium">
              Gmail Label Name
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="label-input"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="inbox-zero-digest-test"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => mutateEmails()}
                disabled={!emailAccountId}
              >
                Search
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to auto-detect
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Left: Test Emails */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Test Emails</h3>

          {!emailAccountId ? (
            <div className="text-sm text-gray-500 text-center py-8">
              Enter your email address above and click "Load" to begin
            </div>
          ) : emailsLoading ? (
            <div className="flex items-center gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : emailsData?.error ? (
            <div className="space-y-3">
              <div className="text-sm text-red-600">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                {emailsData.error}
              </div>
              {emailsData.suggestion && (
                <div className="text-xs text-gray-600">
                  {emailsData.suggestion}
                </div>
              )}
              {emailsData.availableLabels && (
                <div className="text-xs">
                  <div className="font-medium mb-1">Available labels:</div>
                  <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded">
                    {emailsData.availableLabels.map((label: string) => (
                      <div key={label} className="text-gray-700">
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  {testEmails.length} emails with label
                </p>
                {emailsData?.labelName && (
                  <p className="text-xs font-mono text-blue-600">
                    "{emailsData.labelName}"
                  </p>
                )}
              </div>

              {testEmails.length === 0 ? (
                <div className="text-sm text-amber-600 p-3 bg-amber-50 rounded border border-amber-200">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Label found but no emails with this label. Apply the label to
                  some emails in Gmail.
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {testEmails.map((email: TestEmail) => (
                    <div
                      key={email.messageId}
                      className="p-2 border rounded text-sm"
                    >
                      <div className="font-medium truncate">{email.from}</div>
                      <div className="text-gray-600 truncate text-xs">
                        {email.subject}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 mt-4">
                <Button
                  onClick={handleProcess}
                  disabled={testEmails.length === 0 || processing}
                  className="w-full"
                  variant="outline"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `Via Rules (${testEmails.length})`
                  )}
                </Button>

                <Button
                  onClick={async () => {
                    if (!emailAccountId || testEmails.length === 0) return;

                    setProcessing(true);
                    setProcessResult(null);

                    try {
                      const response = await fetch(
                        "/api/admin/digest-tester/force-digest",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            emailAccountId,
                            messageIds: testEmails.map(
                              (e: TestEmail) => e.messageId,
                            ),
                          }),
                        },
                      );

                      if (!response.ok)
                        throw new Error("Failed to process emails");

                      const result = await response.json();
                      setProcessResult(result);
                      mutateRuns();
                      mutatePreview(); // Refresh preview

                      toastSuccess({
                        title: "Digest items created",
                        description: result.message,
                      });
                    } catch (error) {
                      toastError({
                        title: "Error creating digest items",
                        description:
                          error instanceof Error
                            ? error.message
                            : "Unknown error",
                      });
                    } finally {
                      setProcessing(false);
                    }
                  }}
                  disabled={testEmails.length === 0 || processing}
                  className="w-full"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    `1. Force Digest (${testEmails.length})`
                  )}
                </Button>
              </div>

              {processResult && (
                <Button
                  onClick={handleSendDigest}
                  disabled={sending}
                  className="w-full mt-2"
                  variant="default"
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "2. Send Digest Email"
                  )}
                </Button>
              )}
            </>
          )}
        </Card>

        {/* Middle: Current Prompt */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Current AI Prompt</h3>
          <p className="text-xs text-gray-500 mb-4">
            Production prompt (read-only)
            <br />
            Edit: utils/ai/digest/summarize-email-for-digest.ts
          </p>
          <pre className="text-xs bg-gray-50 p-4 rounded overflow-auto max-h-80 whitespace-pre-wrap">
            {currentPrompt || "Loading..."}
          </pre>
        </Card>

        {/* Right: Processing Results */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Processing Results</h3>

          {processResult ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-green-600">
                <CheckCircle className="h-5 w-5 mt-0.5" />
                <div className="text-sm">
                  <div className="font-medium">Success!</div>
                  <div className="text-gray-600 mt-1">
                    {processResult.stats.rulesMatched}/
                    {processResult.stats.totalEmails} rules matched
                  </div>
                  <div className="text-gray-600">
                    {processResult.pendingDigests} pending digests
                  </div>
                  <div className="text-gray-600">
                    {processResult.stats.processingTimeMs}ms
                  </div>
                </div>
              </div>

              <div className="text-xs">
                <div className="font-medium mb-2">Email Results:</div>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {processResult.results.map((r, i: number) => (
                    <div key={i} className="p-2 border rounded">
                      {r.matched ? (
                        <div className="text-green-600">
                          ✓ Rule: {r.ruleName}
                        </div>
                      ) : r.enqueued ? (
                        <div className="text-blue-600">
                          ✓ Enqueued for digest
                        </div>
                      ) : r.error ? (
                        <div className="text-red-600">✗ {r.error}</div>
                      ) : (
                        <div className="text-gray-500">No rule matched</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {processResult.digestItems && processResult.digestItems > 0 && (
                <div className="mt-3 text-xs text-green-600 font-medium">
                  ✓ {processResult.digestItems} digest items created
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Process emails to see results
            </p>
          )}
        </Card>
      </div>

      {/* Bottom: Digest Preview */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Digest Preview (Production Template)
          </h3>
          <div className="flex gap-2">
            <Button
              variant={previewMode === "desktop" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewMode("desktop")}
            >
              <Monitor className="h-4 w-4 mr-2" />
              Desktop
            </Button>
            <Button
              variant={previewMode === "mobile" ? "default" : "outline"}
              size="sm"
              onClick={() => setPreviewMode("mobile")}
            >
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile
            </Button>
          </div>
        </div>

        <div
          className={`border rounded overflow-auto ${
            previewMode === "mobile" ? "max-w-[375px] mx-auto" : "w-full"
          }`}
          style={{ minHeight: "600px" }}
        >
          {!emailAccountId ? (
            <div className="flex items-center justify-center h-[600px] text-gray-500">
              Enter your email address above and click "Load" to begin
            </div>
          ) : previewLoading ? (
            <div className="flex items-center justify-center h-[600px] text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading preview...
            </div>
          ) : previewData?.empty ? (
            <div className="flex items-center justify-center h-[600px] text-gray-500">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>{previewData.message}</p>
              </div>
            </div>
          ) : previewData ? (
            <div className="bg-white">
              <DigestEmail
                {...(() => {
                  // biome-ignore lint/correctness/noUnusedVariables: Used to extract these from props
                  const { empty, message, ...digestProps } = previewData;
                  return {
                    ...digestProps,
                    date: previewData.date
                      ? new Date(previewData.date)
                      : new Date(),
                  };
                })()}
              />
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
