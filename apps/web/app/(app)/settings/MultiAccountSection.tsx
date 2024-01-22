"use client";

import { useCallback } from "react";
import { SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { usePostHog } from "posthog-js/react";
import { CrownIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import { Button } from "@/components/Button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import {
  saveMultiAccountPremiumBody,
  SaveMultiAccountPremiumBody,
} from "@/app/api/user/settings/multi-account/validation";
import { updateMultiAccountPremium } from "@/utils/actions";
import { MultiAccountEmailsResponse } from "@/app/api/user/settings/multi-account/route";
import { AlertBasic, AlertWithButton } from "@/components/Alert";
import { usePremium } from "@/components/PremiumAlert";
import { pricingAdditonalEmail } from "@/app/(app)/premium/config";
import { PremiumTier } from "@prisma/client";
import { env } from "@/env.mjs";
import { getUserTier } from "@/utils/premium";
import { captureException } from "@/utils/error";

export function MultiAccountSection() {
  const { data, isLoading, error } = useSWR<MultiAccountEmailsResponse>(
    "/api/user/settings/multi-account",
  );
  const {
    isPremium,
    data: dataPremium,
    isLoading: isLoadingPremium,
    error: errorPremium,
  } = usePremium();

  const premiumTier = getUserTier(dataPremium?.premium);

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
                {premiumTier && (
                  <AlertBasic
                    title="Extra email price"
                    description={`You are on the ${capitalCase(
                      premiumTier,
                    )} plan. You will be billed ${
                      pricingAdditonalEmail[premiumTier]
                    } for each extra email you add to your account.`}
                    icon={<CrownIcon className="h-4 w-4" />}
                  />
                )}

                <div className="mt-4">
                  <MultiAccountForm
                    emailAddresses={data.users as { email: string }[]}
                    isLifetime={
                      dataPremium?.premium?.tier === PremiumTier.LIFETIME
                    }
                    emailAccountsAccess={
                      dataPremium?.premium?.emailAccountsAccess || 0
                    }
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
              button={<Button link={{ href: "/premium" }}>Upgrade</Button>}
            />
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
}: {
  emailAddresses: { email: string }[];
  isLifetime: boolean;
  emailAccountsAccess: number;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
  } = useForm<SaveMultiAccountPremiumBody>({
    resolver: zodResolver(saveMultiAccountPremiumBody),
    defaultValues: {
      emailAddresses: emailAddresses?.length ? emailAddresses : [{ email: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "emailAddresses",
    control,
  });
  const posthog = usePostHog();

  const extraSeats = fields.length - emailAccountsAccess - 1;
  const needsToPurchaseMoreSeats = isLifetime && extraSeats > 0;

  const onSubmit: SubmitHandler<SaveMultiAccountPremiumBody> = useCallback(
    async (data) => {
      if (!data.emailAddresses) return;
      if (needsToPurchaseMoreSeats) return;

      try {
        const emails = data.emailAddresses.map((e) => e.email);
        const res = await updateMultiAccountPremium(emails);

        if (res && res.error) toastError({ description: res.error });
        else toastSuccess({ description: "Users updated!" });
      } catch (error) {
        captureException(error);
        toastError({ description: "There was an error updating users." });
      }
    },
    [needsToPurchaseMoreSeats],
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

      {needsToPurchaseMoreSeats ? (
        <Button
          type="button"
          loading={isSubmitting}
          link={{
            href: `${env.NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_PAYMENT_LINK}?quantity=${extraSeats}`,
            target: "_blank",
          }}
        >
          Purchase {extraSeats} Extra Seat{extraSeats > 1 ? "s" : ""}
        </Button>
      ) : (
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      )}
    </form>
  );
}
