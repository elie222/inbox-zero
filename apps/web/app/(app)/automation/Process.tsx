"use client";

import { useState } from "react";
import { TestRulesContent } from "@/app/(app)/automation/TestRules";
import { Toggle } from "@/components/Toggle";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function Process() {
  const [applyMode, setApplyMode] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Process your emails</CardTitle>

        <CardDescription>
          {applyMode
            ? "Run your rules on previous emails."
            : "Check how your rules perform against previous emails."}
        </CardDescription>

        <div className="flex pt-1">
          <Toggle
            name="test-mode"
            label="Test"
            labelRight="Apply"
            enabled={applyMode}
            onChange={setApplyMode}
          />
        </div>
      </CardHeader>
      <TestRulesContent testMode={!applyMode} />
    </Card>
  );
}
