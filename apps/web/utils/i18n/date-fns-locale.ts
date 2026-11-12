import type { Locale as DateFnsLocale } from "date-fns";
import { de } from "date-fns/locale/de";
import { es } from "date-fns/locale/es";
import { fr } from "date-fns/locale/fr";
import { ptBR } from "date-fns/locale/pt-BR";
import type { Locale } from "@/utils/i18n/locales";

const DATE_FNS_LOCALES: Record<Exclude<Locale, "en">, DateFnsLocale> = {
  es,
  fr,
  de,
  "pt-BR": ptBR,
};

// English returns undefined so date-fns keeps its default wording and formats.
export function getDateFnsLocale(locale: string): DateFnsLocale | undefined {
  return DATE_FNS_LOCALES[locale as keyof typeof DATE_FNS_LOCALES];
}
