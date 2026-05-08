"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Rule = {
  id: string;
  name: string;
};

type Props = {
  messageId: string;
  fromEmail: string;
  oldRuleId: string;
  oldRuleName: string;
  rules: Rule[];
};

export function FeedbackForm({
  messageId,
  fromEmail,
  oldRuleId,
  oldRuleName,
  rules,
}: Props) {
  const [selectedRuleId, setSelectedRuleId] = useState(oldRuleId);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successRuleName, setSuccessRuleName] = useState("");

  if (status === "success") {
    return (
      <p className="text-sm text-green-700 dark:text-green-400">
        Got it — <strong>{fromEmail}</strong> will be filed under{" "}
        <strong>{successRuleName}</strong> from now on.
      </p>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRuleId === oldRuleId) {
      setErrorMessage(
        "That's the same label — pick a different one to correct it.",
      );
      return;
    }
    setStatus("submitting");
    setErrorMessage("");
    try {
      const res = await fetch("/api/user/rule-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          fromEmail,
          oldRuleId,
          newRuleId: selectedRuleId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }
      const newRule = rules.find((r) => r.id === selectedRuleId);
      setSuccessRuleName(newRule?.name ?? selectedRuleId);
      setStatus("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      setStatus("idle");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Originally filed under:
        </p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {oldRuleName}
        </p>
      </div>

      <div>
        <label
          htmlFor="rule-picker"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Correct label
        </label>
        <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
          <SelectTrigger id="rule-picker" className="w-full max-w-xs">
            <SelectValue placeholder="Select a rule…" />
          </SelectTrigger>
          <SelectContent>
            {rules.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {rule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {errorMessage ? (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      ) : null}

      <Button
        type="submit"
        disabled={status === "submitting" || selectedRuleId === oldRuleId}
      >
        {status === "submitting" ? "Saving…" : "Update label"}
      </Button>
    </form>
  );
}
