"use client";

import { useCallback } from "react";
import { type SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import { useSession } from "@/utils/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { usePostHog } from "posthog-js/react";
import { CrownIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import {
  saveMultiAccountPremiumBody,
  type SaveMultiAccountPremiumBody,
} from "@/app/api/user/settings/multi-account/validation";
import {
  claimPremiumAdminAction,
  updateMultiAccountPremiumAction,
} from "@/utils/actions/premium";
import type { MultiAccountEmailsResponse } from "@/app/api/user/settings/multi-account/route";
import { AlertBasic, AlertWithButton } from "@/components/Alert";
import { usePremium } from "@/components/PremiumAlert";
import { pricingAdditonalEmail } from "@/app/(app)/premium/config";
import { PremiumTier } from "@prisma/client";
import { getUserTier, isAdminForPremium } from "@/utils/premium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useAction } from "next-safe-action/hooks";
import { toastError, toastSuccess } from "@/components/Toast";

export function MultiAccountSection() {
  const { data: session } = useSession();
  const { data, isLoading, error, mutate } = useSWR<MultiAccountEmailsResponse>(
    "/api/user/settings/multi-account",
  );
  const {
    isPremium,
    premium,
    isLoading: isLoadingPremium,
    error: errorPremium,
  } = usePremium();

  const premiumTier = getUserTier(premium);

  const { openModal, PremiumModal } = usePremiumModal();

  const { execute: claimPremiumAdmin } = useAction(claimPremiumAdminAction, {
    onSuccess: () => {
      toastSuccess({ description: "Admin claimed!" });
      mutate();
    },
    onError: (error) => {
      toastError({
        description:
          `Failed to claim premium admin. ${error.error.serverError || ""}`.trim(),
      });
    },
  });

  if (
    isPremium &&
    !isAdminForPremium(data?.admins || [], session?.user.id || "")
  )
    return null;

  return (
    <FormSection id="manage-users">
      <FormSectionLeft
        title="Share Premium"
        description="Share premium with other email accounts. This does not give other accounts access to read your emails."
      />

      <LoadingContent loading={isLoadingPremium} error={errorPremium}>
        {isPremium ? (
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <div>
                {!data?.admins.length && (
                  <div className="mb-4">
                    <Button onClick={() => claimPremiumAdmin()}>
                      Claim Admin
                    </Button>
                  </div>
                )}

                {premiumTier && (
                  <ExtraSeatsAlert
                    premiumTier={premiumTier}
                    emailAccountsAccess={premium?.emailAccountsAccess || 0}
                    seatsUsed={data.users.length}
                  />
                )}

                <div className="mt-4">
                  <MultiAccountForm
                    emailAddresses={data.users as { email: string }[]}
                    isLifetime={premium?.tier === PremiumTier.LIFETIME}
                    emailAccountsAccess={premium?.emailAccountsAccess || 0}
                    pendingInvites={premium?.pendingInvites || []}
                    onUpdate={mutate}
                  />
                </div>
              </div>
            )}
          </LoadingContent>
        ) : (
          <div className="sm:col-span-2">
            <AlertWithButton
              title="Upgrade"
              description="Upgrade to premium to share premium with other email addresses."
              icon={<CrownIcon className="h-4 w-4" />}
              button={<Button onClick={openModal}>Upgrade</Button>}
            />
            <PremiumModal />
          </div>
        )}
      </LoadingContent>
    </FormSection>
  );
}

function MultiAccountForm({
  emailAddresses,
  isLifetime,
  emailAccountsAccess,
  pendingInvites,
  onUpdate,
}: {
  emailAddresses: { email: string }[];
  isLifetime: boolean;
  emailAccountsAccess: number;
  pendingInvites: string[];
  onUpdate?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<SaveMultiAccountPremiumBody>({
    resolver: zodResolver(saveMultiAccountPremiumBody),
    defaultValues: {
      emailAddresses: emailAddresses?.length
        ? [...emailAddresses, ...pendingInvites.map((email) => ({ email }))]
        : [{ email: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "emailAddresses",
    control,
  });
  const posthog = usePostHog();

  const extraSeats = fields.length - emailAccountsAccess - 1;
  const needsToPurchaseMoreSeats = isLifetime && extraSeats > 0;

  const { execute: updateMultiAccountPremium, isExecuting } = useAction(
    updateMultiAccountPremiumAction,
    {
      onSuccess: () => {
        toastSuccess({ description: "Users updated!" });
        onUpdate?.();
      },
      onError: (error) => {
        toastError({
          description:
            `Failed to update users. ${error.error.serverError || ""}`.trim(),
        });
      },
    },
  );

  const onSubmit: SubmitHandler<SaveMultiAccountPremiumBody> = useCallback(
    async (data) => {
      if (!data.emailAddresses) return;
      if (needsToPurchaseMoreSeats) return;

      const emails = data.emailAddresses.map((e) => e.email);
      updateMultiAccountPremium({ emails });
    },
    [needsToPurchaseMoreSeats, updateMultiAccountPremium],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        {fields.map((f, i) => {
          return (
            <div key={f.id}>
              <Input
                type="text"
                name={`rules.${i}.instructions`}
                registerProps={register(`emailAddresses.${i}.email`)}
                error={errors.emailAddresses?.[i]?.email}
                onClickAdd={() => {
                  append({ email: "" });
                  posthog.capture("Clicked Add User");
                }}
                onClickRemove={
                  fields.length > 1
                    ? () => {
                        remove(i);
                        posthog.capture("Clicked Remove User");
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>

      <Button type="submit" loading={isExecuting}>
        Save
      </Button>
    </form>
  );
}

function ExtraSeatsAlert({
  emailAccountsAccess,
  premiumTier,
  seatsUsed,
}: {
  emailAccountsAccess: number;
  premiumTier: PremiumTier;
  seatsUsed: number;
}) {
  if (emailAccountsAccess > seatsUsed) {
    return (
      <AlertBasic
        title="Seats"
        description={`You have access to ${emailAccountsAccess} seats.`}
        icon={<CrownIcon className="h-4 w-4" />}
      />
    );
  }

  return (
    <AlertBasic
      title="Extra email price"
      description={`You are on the ${capitalCase(
        premiumTier,
      )} plan. You will be billed $${
        pricingAdditonalEmail[premiumTier]
      } for each extra email you add to your account.`}
      icon={<CrownIcon className="h-4 w-4" />}
    />
  );
}
