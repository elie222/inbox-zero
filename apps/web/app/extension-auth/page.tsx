"use client";

import { useEffect, useState, useRef } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("extension-auth");

export default function ExtensionAuthPage() {
  const { data: session, status } = useSession();
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasGeneratedToken = useRef(false);

  useEffect(() => {
    // If not authenticated, redirect to sign in
    if (status === "unauthenticated") {
      signIn("google", { callbackUrl: "/extension-auth" });
      return;
    }

    // If authenticated and we haven't generated a token yet, generate session token
    if (status === "authenticated" && session && !hasGeneratedToken.current) {
      hasGeneratedToken.current = true;
      generateSessionToken();
    }
  }, [status, session]);

  const generateSessionToken = async () => {
    try {
      setIsGeneratingToken(true);
      setError(null);

      const response = await fetch("/api/extension/generate-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to generate session token");
      }

      const { sessionToken } = await response.json();

      // Redirect back to extension with session token
      const redirectUrl = `chrome-extension://${searchParams.get("extensionId") || ""}?sessionToken=${sessionToken}`;

      // For development, we'll use a different approach since we can't redirect to chrome-extension://
      // We'll use a custom protocol or just show the token
      if (process.env.NODE_ENV === "development") {
        // In development, we'll redirect to a page that shows the token
        router.push(`/extension-auth/success?sessionToken=${sessionToken}`);
      } else {
        // In production, redirect to the extension
        window.location.href = redirectUrl;
      }
    } catch (error) {
      logger.error("Error generating session token:", { error });
      setError("Failed to generate session token");
      // Reset the flag so user can try again
      hasGeneratedToken.current = false;
    } finally {
      setIsGeneratingToken(false);
    }
  };

  if (status === "loading" || isGeneratingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="text-gray-600">
            {status === "loading"
              ? "Loading..."
              : "Generating session token..."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
            {error}
          </div>
          <button
            onClick={() => window.close()}
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <p className="text-gray-600">Setting up your session...</p>
      </div>
    </div>
  );
}
