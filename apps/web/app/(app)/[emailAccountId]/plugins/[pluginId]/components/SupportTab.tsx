"use client";

import { ExternalLink, MessageCircle } from "lucide-react";
import { TrustBadge } from "@/components/plugins/TrustBadge";

interface SupportTabProps {
  author: string;
  trustLevel?: "verified" | "community" | "unverified";
  repositoryUrl?: string;
  homepage?: string;
  privacyPolicy?: string;
  termsOfService?: string;
}

export function SupportTab({
  author,
  trustLevel,
  repositoryUrl,
  homepage,
  privacyPolicy,
  termsOfService,
}: SupportTabProps) {
  return (
    <div className="space-y-6">
      {/* Publisher Info Card */}
      <div className="rounded-lg border border-border p-6">
        <h3 className="font-semibold mb-4">Publisher Information</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              {author.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium">{author}</div>
              {trustLevel && <TrustBadge level={trustLevel} />}
            </div>
          </div>

          <div className="pt-3 space-y-2">
            {homepage && (
              <a
                href={homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
                Visit website
              </a>
            )}
            {repositoryUrl && (
              <a
                href={`${repositoryUrl}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4" />
                Report an issue
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Legal Links */}
      {(privacyPolicy || termsOfService) && (
        <div className="rounded-lg border border-border p-6">
          <h3 className="font-semibold mb-4">Legal</h3>
          <div className="flex gap-4">
            {privacyPolicy && (
              <a
                href={privacyPolicy}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Privacy Policy
              </a>
            )}
            {termsOfService && (
              <a
                href={termsOfService}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Terms of Service
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
