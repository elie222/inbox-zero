"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, Eye, EyeOff } from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import { connectMcpApiTokenAction } from "@/utils/actions/mcp";
import type { ConnectMcpApiTokenBody } from "@/utils/actions/mcp.validation";
import { useAccount } from "@/providers/EmailAccountProvider";

interface ConnectApiTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: {
    name: string;
    displayName: string;
    description?: string;
  };
  onSuccess?: () => void;
}

export function ConnectApiTokenModal({
  open,
  onOpenChange,
  integration,
  onSuccess,
}: ConnectApiTokenModalProps) {
  const [connectionName, setConnectionName] = useState(
    `My ${integration.displayName}`,
  );
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { emailAccountId } = useAccount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!connectionName.trim() || !apiKey.trim()) {
      toastError({
        title: "Missing information",
        description: "Please provide both a connection name and API key.",
      });
      return;
    }

    setIsConnecting(true);

    try {
      const result = await connectMcpApiTokenAction(emailAccountId, {
        integration: integration.name,
        name: connectionName.trim(),
        apiKey: apiKey.trim(),
      } satisfies ConnectMcpApiTokenBody);

      if (result?.serverError) {
        toastError({
          title: "Connection failed",
          description: result.serverError,
        });
        return;
      }

      toastSuccess({
        title: "Connection successful",
        description:
          result?.data?.message || "Successfully connected integration",
      });

      // Reset form
      setConnectionName(`My ${integration.displayName}`);
      setApiKey("");
      setShowApiKey(false);

      // Close modal and trigger refresh
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Failed to connect integration:", error);
      toastError({
        title: "Connection failed",
        description:
          "Please try again or contact support if the issue persists.",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const getInstructions = () => {
    switch (integration.name) {
      case "stripe":
        return {
          title: "Get your Stripe API Key",
          steps: [
            "Go to your Stripe Dashboard",
            "Navigate to Developers → API Keys",
            "Copy your Secret Key (starts with sk_)",
            "Use your Test key for testing, Live key for production",
          ],
          link: "https://dashboard.stripe.com/apikeys",
          placeholder: "sk_test_... or sk_live_...",
          warning:
            "Never share your API key publicly. It will be encrypted and stored securely.",
        };
      default:
        return {
          title: "Get your API Key",
          steps: [
            "Go to your account settings",
            "Find the API Keys or Developer section",
            "Copy your API key",
          ],
          placeholder: "Enter your API key",
          warning: "Your API key will be encrypted and stored securely.",
        };
    }
  };

  const instructions = getInstructions();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Connect {integration.displayName}</DialogTitle>
            <DialogDescription>{integration.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="connectionName">Connection Name</Label>
              <Input
                id="connectionName"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                placeholder={`My ${integration.displayName}`}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="apiKey">API Key</Label>
                {instructions.link && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => window.open(instructions.link, "_blank")}
                  >
                    {instructions.title}{" "}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </Button>
                )}
              </div>

              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={instructions.placeholder}
                  className="pr-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-sm">
                <div className="space-y-2">
                  <div>
                    <strong>How to get your API key:</strong>
                  </div>
                  <ol className="list-decimal list-inside space-y-1">
                    {instructions.steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                  <div className="pt-2 text-xs text-muted-foreground">
                    ⚠️ {instructions.warning}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isConnecting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
