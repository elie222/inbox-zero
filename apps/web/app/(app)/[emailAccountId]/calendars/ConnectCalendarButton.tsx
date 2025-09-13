"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { connectGoogleCalendarAction } from "@/utils/actions/calendar";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ConnectCalendarButton() {
  const { emailAccountId } = useAccount();
  const { execute: executeConnect, isExecuting: isConnecting } = useAction(
    connectGoogleCalendarAction.bind(null, emailAccountId),
  );

  const handleConnect = async () => {
    executeConnect();
  };

  return (
    <Button
      onClick={handleConnect}
      disabled={isConnecting}
      className="flex items-center gap-2"
    >
      <Calendar className="h-4 w-4" />
      {isConnecting ? "Connecting..." : "Connect Google Calendar"}
    </Button>
  );
}
