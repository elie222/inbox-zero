"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, PowerIcon, PowerOffIcon } from "lucide-react";
import { togglePluginEnabledAction } from "@/utils/actions/plugins";
import { toastSuccess, toastError } from "@/components/Toast";

interface PluginStatusDropdownProps {
  pluginId: string;
  enabled: boolean;
  onUpdate: () => void;
}

export function PluginStatusDropdown({
  pluginId,
  enabled,
  onUpdate,
}: PluginStatusDropdownProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (newState: boolean) => {
    setIsLoading(true);
    try {
      const result = await togglePluginEnabledAction({
        pluginId,
        enabled: newState,
      });

      if (result?.serverError) {
        toastError({
          title: newState ? "Failed to enable" : "Failed to disable",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: `Plugin ${newState ? "enabled" : "disabled"}`,
        });
        onUpdate();
      }
    } catch {
      toastError({
        title: "Action failed",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={
            enabled
              ? "border-green-600 text-green-600"
              : "border-gray-400 text-gray-600"
          }
          disabled={isLoading}
        >
          {isLoading ? (
            "Loading..."
          ) : (
            <>
              {enabled ? (
                <>
                  <PowerIcon className="mr-2 h-4 w-4" />
                  Enabled
                </>
              ) : (
                <>
                  <PowerOffIcon className="mr-2 h-4 w-4" />
                  Disabled
                </>
              )}
              <ChevronDownIcon className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => handleToggle(true)}
          disabled={enabled}
          className="cursor-pointer"
        >
          <PowerIcon className="mr-2 h-4 w-4" />
          Enable
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleToggle(false)}
          disabled={!enabled}
          className="cursor-pointer"
        >
          <PowerOffIcon className="mr-2 h-4 w-4" />
          Disable
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
