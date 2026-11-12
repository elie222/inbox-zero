import { z } from "zod";
import { LOCALES } from "@/utils/i18n/locales";

export const setLocaleBody = z.object({ locale: z.enum(LOCALES) });
