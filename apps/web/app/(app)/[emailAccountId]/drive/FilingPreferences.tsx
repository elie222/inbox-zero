"use client";

import { LoadingContent } from "@/components/LoadingContent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useDriveFolders } from "@/hooks/useDriveFolders";
import { FilingRulesForm } from "./FilingRulesForm";
import { AllowedFolders } from "./AllowedFolders";

export function FilingPreferences() {
  const { emailAccountId } = useAccount();

  const {
    data: emailAccount,
    isLoading: emailLoading,
    error: emailError,
    mutate: mutateEmail,
  } = useEmailAccountFull();

  const {
    data: foldersData,
    isLoading: foldersLoading,
    error: foldersError,
    mutate: mutateFolders,
  } = useDriveFolders();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <LoadingContent loading={foldersLoading} error={foldersError}>
        {foldersData && (
          <AllowedFolders
            emailAccountId={emailAccountId}
            availableFolders={foldersData.availableFolders}
            savedFolders={foldersData.savedFolders}
            mutateFolders={mutateFolders}
          />
        )}
      </LoadingContent>
      <LoadingContent loading={emailLoading} error={emailError}>
        {emailAccount && (
          <FilingRulesForm
            emailAccountId={emailAccountId}
            initialPrompt={emailAccount.filingPrompt || ""}
            mutateEmail={mutateEmail}
          />
        )}
      </LoadingContent>
    </div>
  );
}
