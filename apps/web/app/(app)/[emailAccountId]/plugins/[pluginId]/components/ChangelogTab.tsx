"use client";

import { Badge } from "@/components/Badge";
import { CheckCircle2, Clock } from "lucide-react";

/**
 * Displays version history with release notes for a plugin
 *
 * @example
 * ```tsx
 * <ChangelogTab
 *   changelog={[
 *     {
 *       version: '1.2.0',
 *       date: '2024-01-15',
 *       changes: {
 *         new: ['Added dark mode support', 'New notification settings'],
 *         improved: ['Faster load times', 'Better error messages'],
 *         fixed: ['Fixed memory leak', 'Resolved crash on startup']
 *       }
 *     }
 *   ]}
 *   installedVersion="1.1.0"
 * />
 * ```
 */

interface ChangelogEntry {
  version: string;
  date: string;
  changes: {
    new?: string[];
    improved?: string[];
    fixed?: string[];
  };
}

interface ChangelogTabProps {
  changelog: ChangelogEntry[];
  installedVersion?: string;
}

export function ChangelogTab({
  changelog,
  installedVersion,
}: ChangelogTabProps) {
  if (!changelog || changelog.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No changelog available for this plugin.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {changelog.map((entry, index) => (
        <div
          key={entry.version}
          className="rounded-lg border border-border p-4"
        >
          <div className="flex items-center gap-3 mb-3">
            <Badge color={index === 0 ? "blue" : "gray"}>
              v{entry.version}
            </Badge>
            {entry.version === installedVersion && (
              <Badge color="green">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Installed
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">{entry.date}</span>
          </div>

          <div className="space-y-3">
            {entry.changes.new && entry.changes.new.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-emerald-600 mb-1">
                  New
                </h4>
                <ul className="space-y-1 text-sm">
                  {entry.changes.new.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {entry.changes.improved && entry.changes.improved.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-blue-600 mb-1">
                  Improved
                </h4>
                <ul className="space-y-1 text-sm">
                  {entry.changes.improved.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {entry.changes.fixed && entry.changes.fixed.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-amber-600 mb-1">
                  Fixed
                </h4>
                <ul className="space-y-1 text-sm">
                  {entry.changes.fixed.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-muted-foreground">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!entry.changes.new &&
              !entry.changes.improved &&
              !entry.changes.fixed && (
                <p className="text-sm text-muted-foreground">
                  No changes documented for this version.
                </p>
              )}
          </div>
        </div>
      ))}
    </div>
  );
}
