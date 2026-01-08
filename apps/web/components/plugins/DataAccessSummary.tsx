"use client";

import { Info } from "lucide-react";

interface DataAccessSummaryProps {
  capabilities: string[];
  allowedHosts?: string[];
}

const CAN_DESCRIPTIONS: Record<string, string> = {
  "email:classify": "Read email metadata (subject, sender, date)",
  "email:signal": "Detect patterns in your emails",
  "email:trigger": "Respond to specific email patterns",
  "email:draft": "Create draft replies",
  "email:send": "Send emails on your behalf",
  "email:modify": "Archive, label, and modify emails",
  "followup:detect": "Detect emails that need follow-up",
  "calendar:list": "View your calendar list",
  "calendar:read": "Read your calendar events",
  "calendar:write": "Create and modify calendar events",
  "schedule:cron": "Run scheduled background tasks",
  "automation:rule": "Create automated email rules",
};

const ALL_ELEVATED_CAPABILITIES = [
  "email:send",
  "email:modify",
  "email:draft",
  "calendar:write",
  "automation:rule",
];

const CANNOT_DESCRIPTIONS: Record<string, string> = {
  "email:send": "Send emails on your behalf",
  "email:modify": "Delete or permanently modify emails",
  "email:draft": "Create drafts without your review",
  "calendar:write": "Modify your calendar",
  "automation:rule": "Create automation rules",
};

export function DataAccessSummary({
  capabilities,
  allowedHosts,
}: DataAccessSummaryProps) {
  const canDo = capabilities
    .map((cap) => CAN_DESCRIPTIONS[cap])
    .filter(Boolean);

  if (allowedHosts && allowedHosts.length > 0) {
    allowedHosts.forEach((host) => {
      canDo.push(`Send data to ${host}`);
    });
  }

  const missingElevatedCapabilities = ALL_ELEVATED_CAPABILITIES.filter(
    (cap) => !capabilities.includes(cap),
  );
  const cannotDo = missingElevatedCapabilities
    .map((cap) => CANNOT_DESCRIPTIONS[cap])
    .filter(Boolean);

  cannotDo.push("Access other accounts");
  cannotDo.push("Share your data with third parties");

  if (canDo.length === 0 && cannotDo.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
        <div className="flex-1 space-y-3">
          <h4 className="font-semibold text-blue-900">Data Access Summary</h4>

          {canDo.length > 0 && (
            <div>
              <div className="text-sm font-medium text-blue-900 mb-1.5">
                This plugin will be able to:
              </div>
              <ul className="space-y-1">
                {canDo.map((item, index) => (
                  <li key={index} className="text-sm text-blue-800 flex gap-2">
                    <span className="text-blue-600">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cannotDo.length > 0 && (
            <div>
              <div className="text-sm font-medium text-blue-900 mb-1.5">
                This plugin CANNOT:
              </div>
              <ul className="space-y-1">
                {cannotDo.map((item, index) => (
                  <li key={index} className="text-sm text-blue-800 flex gap-2">
                    <span className="text-blue-600">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
