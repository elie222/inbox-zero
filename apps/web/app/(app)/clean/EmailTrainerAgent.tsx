"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TypographyH3, SectionDescription } from "@/components/Typography";
import { Loader2, CheckCircle, AlertCircle, XCircle } from "lucide-react";
import {
  startEmailTrainingAction,
  getEmailTrainingStatusAction,
  cancelEmailTrainingAction,
} from "@/utils/actions/email-trainer";
import { toastError, toastSuccess } from "@/components/Toast";
import { isActionError } from "@/utils/error";
import type { EmailAction, JobStatus } from "./types";

interface EmailTrainerAgentProps {
  action: EmailAction;
  timeRangeInDays: number;
  labelInstructions?: string;
  onReset: () => void;
}

export function EmailTrainerAgent({
  action,
  timeRangeInDays,
  labelInstructions,
  onReset,
}: EmailTrainerAgentProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>("INITIALIZING");
  const [progress, setProgress] = useState(0);
  const [totalEmails, setTotalEmails] = useState(0);
  const [processedEmails, setProcessedEmails] = useState(0);
  const [messages, setMessages] = useState<string[]>([
    "Initializing email trainer...",
  ]);

  // Start the email training process
  const startTraining = useCallback(async () => {
    setStatus("STARTING");
    addMessage("Starting email training process...");

    const result = await startEmailTrainingAction({
      action,
      timeRangeInDays,
      labelInstructions: labelInstructions || "",
    });

    if (isActionError(result)) {
      setStatus("ERROR");
      addMessage(`Error: ${result.error}`);
      toastError({
        title: "Error starting email training",
        description: result.error,
      });
      return;
    }

    if (result.jobId) {
      setJobId(result.jobId);
      setStatus("RUNNING");
      addMessage(`Job started with ID: ${result.jobId}`);
      addMessage("Processing emails...");
    } else {
      setStatus("ERROR");
      addMessage("Error: No job ID returned");
      toastError({
        title: "Error starting email training",
        description: "No job ID returned",
      });
    }
  }, [action, timeRangeInDays, labelInstructions]);

  // Cancel the email training process
  const cancelTraining = useCallback(async () => {
    if (!jobId) return;

    addMessage("Cancelling email training...");

    const result = await cancelEmailTrainingAction({
      jobId,
    });

    if (isActionError(result)) {
      addMessage(`Error cancelling: ${result.error}`);
      toastError({
        title: "Error cancelling",
        description: result.error,
      });
      return;
    }

    setStatus("CANCELLED");
    addMessage("Email training cancelled.");
    toastSuccess({
      description: "Email training cancelled",
    });
  }, [jobId]);

  // Add a message to the log
  const addMessage = useCallback((message: string) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Poll for job status updates
  useEffect(() => {
    if (!jobId || status !== "RUNNING") return;

    const pollStatus = async () => {
      const result = await getEmailTrainingStatusAction({
        jobId,
      });

      if (isActionError(result)) {
        addMessage(`Error getting status: ${result.error}`);
        return;
      }

      if (result.status) {
        setStatus(result.status as JobStatus);
      }

      if (typeof result.progress === "number") {
        setProgress(result.progress);
      }

      if (typeof result.totalEmails === "number") {
        setTotalEmails(result.totalEmails);
      }

      if (typeof result.processedEmails === "number") {
        setProcessedEmails(result.processedEmails);
      }

      // Add messages based on progress
      if (processedEmails % 20 === 0 && processedEmails > 0) {
        addMessage(`Processed ${processedEmails} of ${totalEmails} emails`);
      }

      // If the job is complete, add a completion message
      if (result.status === "COMPLETED") {
        addMessage("Email training completed successfully!");
        toastSuccess({
          description: "Email training completed",
        });
      } else if (result.status === "ERROR") {
        addMessage(`Error: ${result.error || "Unknown error occurred"}`);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [jobId, status, processedEmails, totalEmails, addMessage]);

  // Start the training process when the component mounts
  useEffect(() => {
    startTraining();
  }, [startTraining]);

  // Render the status icon based on the current status
  const renderStatusIcon = () => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case "ERROR":
        return <AlertCircle className="h-6 w-6 text-red-500" />;
      case "CANCELLED":
        return <XCircle className="h-6 w-6 text-amber-500" />;
      default:
        return <Loader2 className="h-6 w-6 animate-spin text-blue-500" />;
    }
  };

  // Calculate progress percentage
  const progressPercentage =
    totalEmails > 0 ? Math.round((processedEmails / totalEmails) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        {renderStatusIcon()}
        <TypographyH3>
          Email Trainer {status === "COMPLETED" ? "Complete" : "in Progress"}
        </TypographyH3>
      </div>

      <SectionDescription>
        {status === "COMPLETED"
          ? `Successfully processed ${processedEmails} emails.`
          : status === "CANCELLED"
            ? "Email training was cancelled."
            : status === "ERROR"
              ? "An error occurred during email training."
              : `Processing emails (${progressPercentage}% complete)`}
      </SectionDescription>

      {/* Progress bar */}
      {status === "RUNNING" && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-in-out dark:bg-blue-500"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

      {/* Message log */}
      <Card className="max-h-60 overflow-y-auto p-4">
        <div className="space-y-2">
          {messages.map((message, index) => (
            <div
              key={index}
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              {message}
            </div>
          ))}
        </div>
      </Card>

      {/* Action buttons */}
      <div className="flex space-x-4">
        {status === "RUNNING" && (
          <Button variant="destructive" onClick={cancelTraining}>
            Cancel
          </Button>
        )}
        {(status === "COMPLETED" ||
          status === "CANCELLED" ||
          status === "ERROR") && <Button onClick={onReset}>Start Over</Button>}
      </div>
    </div>
  );
}
