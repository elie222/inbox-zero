import type { Locale as DateFnsLocale } from "date-fns";
import { de } from "date-fns/locale/de";
import { es } from "date-fns/locale/es";
import { fr } from "date-fns/locale/fr";
import { it } from "date-fns/locale/it";
import { ja } from "date-fns/locale/ja";
import { ko } from "date-fns/locale/ko";
import { nl } from "date-fns/locale/nl";
import { pl } from "date-fns/locale/pl";
import { ptBR } from "date-fns/locale/pt-BR";
import { tr } from "date-fns/locale/tr";
import { zhCN } from "date-fns/locale/zh-CN";
import type { Locale } from "@/utils/i18n/locales";

const DATE_FNS_LOCALES: Record<Exclude<Locale, "en">, DateFnsLocale> = {
  es,
  fr,
  de,
  "pt-BR": ptBR,
  it,
  nl,
  pl,
  tr,
  ja,
  ko,
  "zh-CN": zhCN,
};

// English returns undefined so date-fns keeps its default wording and formats.
export function getDateFnsLocale(locale: string): DateFnsLocale | undefined {
  return DATE_FNS_LOCALES[locale as keyof typeof DATE_FNS_LOCALES];
}
