import { z } from "zod";

export const imapSecuritySchema = z.enum(["tls", "starttls", "none"]);

export const imapCredentialSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65_535).default(993),
  imapSecurity: imapSecuritySchema.default("tls"),
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65_535).default(587),
  smtpSecurity: imapSecuritySchema.default("starttls"),
  username: z.string().min(1),
  password: z.string().min(1),
});

export type ImapCredentialInput = z.infer<typeof imapCredentialSchema>;

export const testImapConnectionSchema = z.object({
  imapHost: z.string().min(1),
  imapPort: z.number().int().min(1).max(65_535),
  imapSecurity: imapSecuritySchema,
  smtpHost: z.string().min(1),
  smtpPort: z.number().int().min(1).max(65_535),
  smtpSecurity: imapSecuritySchema,
  username: z.string().min(1),
  password: z.string().min(1),
});
