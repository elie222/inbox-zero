/**
 * Example usage of PermissionList component with visual risk bars
 */

import { PermissionList } from "./PermissionList";

// Example: Default variant with risk bars and "Why needed" explanations
export function PermissionListExample() {
  const permissions = [
    {
      name: "emails:read",
      description: "Read email content and metadata",
      risk: "elevated" as const,
      whyNeeded: "To analyze emails for newsletters and subscription detection",
    },
    {
      name: "emails:modify",
      description: "Modify email labels and categories",
      risk: "standard" as const,
      whyNeeded: "To automatically categorize and organize your emails",
    },
    {
      name: "contacts:read",
      description: "Access contact information",
      risk: "standard" as const,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-3">Default View</h3>
        <PermissionList permissions={permissions} variant="default" />
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Compact View</h3>
        <PermissionList permissions={permissions} variant="compact" />
      </div>
    </div>
  );
}
