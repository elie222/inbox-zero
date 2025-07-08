import { useState } from "react";
import { MultimodalInput } from "./multimodal-input";
import { createDisplayValueForInput } from "@/utils/email-display";

export function EmailDisplayExample() {
  const [input, setInput] = useState("");

  // Example email data input
  const exampleEmailInput = `You applied the wrong rule to this email.
Fix our rules so this type of email is handled correctly in the future.

Email details:
*From*: john@example.com
*Subject*: Meeting Tomorrow
*Content*: Hi, just wanted to confirm our meeting tomorrow at 2 PM.

Current rule applied: Archive

Reason the rule was chosen:
This email appears to be a meeting confirmation.

The rule that should have been applied was: "Meeting Confirmations"`;

  // Example of what the display will look like
  const exampleDisplay = `You applied the wrong rule to this email.
Fix our rules so this type of email is handled correctly in the future.

Email details:
📧 [Meeting Tomorrow]

Current rule applied: Archive

Reason the rule was chosen:
This email appears to be a meeting confirmation.

The rule that should have been applied was: "Meeting Confirmations"`;

  const displayValue = createDisplayValueForInput(input);

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Email Display Example</h3>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Input (what gets sent to AI):
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="h-32 w-full rounded border p-2"
          placeholder="Type or paste email data here..."
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Display Value (what user sees):
        </label>
        <div className="whitespace-pre-wrap rounded bg-gray-100 p-2">
          {displayValue || "No display value (shows original input)"}
        </div>
        {displayValue && (
          <div className="text-xs text-gray-600">
            <strong>Example:</strong> {exampleDisplay}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Chat Input (with display):
        </label>
        <div className="rounded border">
          <MultimodalInput
            input={input}
            setInput={setInput}
            handleSubmit={() => {}}
            status="ready"
            stop={() => {}}
            setMessages={() => {}}
            displayValue={displayValue}
          />
        </div>
      </div>

      <button
        onClick={() => setInput(exampleEmailInput)}
        className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        Load Example Email Data
      </button>
    </div>
  );
}
