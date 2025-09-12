"use client";

import { Button } from "@/components/ui/button";
import { linkSocial } from "@/utils/auth-client";
import { CALENDAR_SCOPES } from "@/utils/gmail/scopes";
import { toastSuccess, toastError } from "@/components/Toast";
import { useState } from "react";
import { CalendarIcon, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CalendarConnectPromptProps {
  onConnect?: () => void;
  className?: string;
}

export function CalendarConnectPrompt({
  onConnect,
  className = "",
}: CalendarConnectPromptProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectCalendar = async () => {
    try {
      setIsConnecting(true);

      await linkSocial({
        provider: "google",
        scopes: CALENDAR_SCOPES,
        callbackURL: `${window.location.pathname}?calendarLinked=true`,
      });

      toastSuccess({
        description: "Redirecting to Google to grant calendar permissions...",
      });

      onConnect?.();
    } catch (error) {
      console.error("Error connecting calendar:", error);
      toastError({
        title: "Connection Failed",
        description:
          "Failed to initiate calendar connection. Please try again.",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={handleConnectCalendar}
        disabled={isConnecting}
        className="h-8 px-3 text-sm font-medium text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 inline-flex items-center gap-2"
      >
        <CalendarIcon className="h-4 w-4" />
        Connect your calendar
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
          </TooltipTrigger>
          <TooltipContent>
            <p>
              If your calendar is connected, your draft replies can predict your
              availability
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
