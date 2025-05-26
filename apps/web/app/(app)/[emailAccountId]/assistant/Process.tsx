"use client";

import { useQueryState } from "nuqs";
import { ProcessRulesContent } from "@/app/(app)/[emailAccountId]/assistant/ProcessRules";
import { Toggle } from "@/components/Toggle";
import { CardDescription } from "@/components/ui/card";

export function Process() {
  const [mode, setMode] = useQueryState("mode");
  const isApplyMode = mode === "apply";

  return (
    <>
      <div className="flex items-center justify-between py-4">
        <div className="flex flex-col space-y-1.5">
          <CardDescription>
            {isApplyMode
              ? "Run your rules on previous emails"
              : "Check how your rules perform against previous emails"}
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
      <ProcessRulesContent testMode={!isApplyMode} />
    </>
  );
}
