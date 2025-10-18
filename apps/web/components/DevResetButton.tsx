"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  devDeleteAccountAction,
  devResetOnboardingAction,
} from "@/utils/actions/dev-helpers";
import { useRouter } from "next/navigation";
import { RotateCcw, ChevronDown } from "lucide-react";

export function DevResetButton({ isAdmin }: { isAdmin: boolean }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const router = useRouter();

  const { execute: executeDelete, isExecuting: isDeleting } = useAction(
    devDeleteAccountAction,
    {
      onSuccess: () => {
        // Redirect to login page after account deletion
        router.push("/login");
      },
      onError: (error) => {
        console.error("Failed to delete account:", error);
        alert("Failed to delete account. Check console for details.");
      },
    },
  );

  const {
    execute: executeResetOnboarding,
    isExecuting: isResettingOnboarding,
  } = useAction(devResetOnboardingAction, {
    onSuccess: () => {
      // Redirect to welcome-redirect which will trigger the full onboarding flow
      router.push("/welcome-redirect");
      router.refresh();
    },
    onError: (error) => {
      console.error("Failed to reset onboarding:", error);
      alert("Failed to reset onboarding. Check console for details.");
    },
  });

  // Only show in local development environment or for admin users
  // Check for local development by looking at the database URL or environment
  const isLocalDev =
    process.env.NODE_ENV === "development" &&
    (process.env.DATABASE_URL?.includes("localhost") ||
      process.env.DATABASE_URL?.includes("inbox_zero_local") ||
      process.env.NEXT_PUBLIC_BASE_URL?.includes("localhost"));

  if (!isLocalDev && !isAdmin) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="destructive"
            size="sm"
            className="fixed bottom-4 right-4 z-50 shadow-lg"
            title="Dev Reset Options"
          >
            <RotateCcw className="size-4 mr-2" />
            Dev Reset
            <ChevronDown className="size-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setShowOnboardingDialog(true)}>
            <RotateCcw className="size-4 mr-2" />
            Reset Onboarding
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <RotateCcw className="size-4 mr-2" />
            Delete Account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Reset Onboarding Dialog */}
      <AlertDialog
        open={showOnboardingDialog}
        onOpenChange={setShowOnboardingDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all your onboarding data and survey answers so you
              can test the full onboarding flow from the beginning. Your
              account, email data, and settings will remain intact.
              <p className="mt-3 font-semibold text-foreground">
                You will be redirected to start the onboarding flow again.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingOnboarding}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executeResetOnboarding({})}
              disabled={isResettingOnboarding}
            >
              {isResettingOnboarding ? "Resetting..." : "Reset Onboarding"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account & Reset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will completely delete your account, including:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>User profile and settings</li>
                <li>All email accounts and data</li>
                <li>Premium subscriptions (if any)</li>
                <li>All automation rules and history</li>
              </ul>
              <p className="mt-3 font-semibold text-foreground">
                You will be signed out and can test the signup flow from
                scratch.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => executeDelete({})}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
