"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bell, X } from "lucide-react";
import { useState } from "react";

interface UpdateNotificationProps {
  count: number;
  onViewUpdates: () => void;
  onUpdateAll: () => void;
  isUpdating?: boolean;
}

export function UpdateNotification({
  count,
  onViewUpdates,
  onUpdateAll,
  isUpdating = false,
}: UpdateNotificationProps) {
  const [dismissed, setDismissed] = useState(false);

  if (count === 0 || dismissed) return null;

  return (
    <Alert className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-4 w-4" />
          <AlertDescription className="m-0">
            {count} plugin update{count > 1 ? "s" : ""} available
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onViewUpdates}>
            View
          </Button>
          <Button size="sm" onClick={onUpdateAll} loading={isUpdating}>
            Update All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Alert>
  );
}
