import { z } from "zod";

export const mobileAuthProviderSchema = z.enum([
  "apple",
  "google",
  "microsoft",
]);
