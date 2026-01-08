"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SettingsIcon } from "lucide-react";

export function AdminPluginsLink() {
  return (
    <div className="max-w-sm">
      <h3 className="text-base font-semibold mb-2">Plugin Management</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Configure which plugins users can install and use in your organization.
      </p>
      <Link href="/admin/plugins">
        <Button variant="outline" size="sm">
          <SettingsIcon className="mr-2 h-4 w-4" />
          Manage Plugins
        </Button>
      </Link>
    </div>
  );
}
