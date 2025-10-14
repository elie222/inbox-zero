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
import { devDeleteAccountAction } from "@/utils/actions/dev-helpers";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

export function DevResetButton({ isAdmin }: { isAdmin: boolean }) {
  const [showDialog, setShowDialog] = useState(false);
  const router = useRouter();

  const { execute, isExecuting } = useAction(devDeleteAccountAction, {
    onSuccess: () => {
      // Redirect to login page after account deletion
      router.push("/login");
    },
    onError: (error) => {
      console.error("Failed to delete account:", error);
      alert("Failed to delete account. Check console for details.");
    },
  });

  // Only show in development or for admin users
  if (process.env.NODE_ENV !== "development" && !isAdmin) {
    return null;
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="fixed bottom-4 right-4 z-50 shadow-lg"
        title="Dev Reset: Delete account and start fresh"
      >
        <RotateCcw className="size-4 mr-2" />
        Dev Reset
      </Button>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
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
            <AlertDialogCancel disabled={isExecuting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => execute({})}
              disabled={isExecuting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isExecuting ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
