"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
import { toastError } from "@/components/Toast";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setLocaleAction } from "@/utils/actions/locale";
import { getActionErrorMessage } from "@/utils/error";
import { LOCALE_LABELS, LOCALES, toLocale } from "@/utils/i18n/locales";

export function LanguageSection() {
  const { i18n, t } = useLingui();
  const { execute, isExecuting } = useAction(setLocaleAction, {
    onError: ({ error }) =>
      toastError({ description: getActionErrorMessage(error) }),
  });

  return (
    <>
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <Trans>Language</Trans>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <Select
            value={i18n.locale}
            onValueChange={(value) => execute({ locale: toLocale(value) })}
            disabled={isExecuting}
          >
            <SelectTrigger className="w-40" aria-label={t`Language`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((locale) => (
                <SelectItem key={locale} value={locale} lang={locale}>
                  {LOCALE_LABELS[locale]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ItemActions>
      </Item>
      <ItemSeparator />
    </>
  );
}
