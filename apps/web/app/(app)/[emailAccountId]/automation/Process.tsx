"use client";

import { useQueryState } from "nuqs";
import { ProcessRulesContent } from "@/app/(app)/[emailAccountId]/automation/ProcessRules";
import { Toggle } from "@/components/Toggle";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Process() {
  const [mode, setMode] = useQueryState("mode");
  const isApplyMode = mode === "apply";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex flex-col space-y-1.5">
            <CardTitle>
              {isApplyMode ? "Process your emails" : "Test your rules"}
            </CardTitle>

            <CardDescription>
              {isApplyMode
                ? "Run your rules on previous emails."
                : "Check how your rules perform against previous emails."}
            </CardDescription>
          </div>

          <div className="flex pt-1">
            <Toggle
              name="test-mode"
              label="Test"
              labelRight="Apply"
              enabled={isApplyMode}
              onChange={(enabled) => setMode(enabled ? "apply" : "test")}
            />
          </div>
        </div>
      </CardHeader>
      <ProcessRulesContent testMode={!isApplyMode} />
    </Card>
  );
}
