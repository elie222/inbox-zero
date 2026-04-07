export interface ImapCredentialConfig {
  email: string;
  emailAccountId: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: "tls" | "starttls" | "none";
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "none";
  username: string;
}

export interface ImapProviderPreset {
  imapHost: string;
  imapPort: number;
  imapSecurity: "tls" | "starttls" | "none";
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls" | "none";
}

export const IMAP_PROVIDER_PRESETS: ImapProviderPreset[] = [
  {
    name: "Amazon WorkMail (us-east-1)",
    imapHost: "imap.mail.us-east-1.awsapps.com",
    imapPort: 993,
    imapSecurity: "tls",
    smtpHost: "smtp.mail.us-east-1.awsapps.com",
    smtpPort: 465,
    smtpSecurity: "tls",
  },
  {
    name: "Amazon WorkMail (eu-west-1)",
    imapHost: "imap.mail.eu-west-1.awsapps.com",
    imapPort: 993,
    imapSecurity: "tls",
    smtpHost: "smtp.mail.eu-west-1.awsapps.com",
    smtpPort: 465,
    smtpSecurity: "tls",
  },
  {
    name: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: 993,
    imapSecurity: "tls",
    smtpHost: "smtp.fastmail.com",
    smtpPort: 465,
    smtpSecurity: "tls",
  },
  {
    name: "Yahoo Mail",
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecurity: "tls",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecurity: "tls",
  },
  {
    name: "iCloud Mail",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecurity: "tls",
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecurity: "starttls",
  },
  {
    name: "ProtonMail Bridge",
    imapHost: "127.0.0.1",
    imapPort: 1143,
    imapSecurity: "starttls",
    smtpHost: "127.0.0.1",
    smtpPort: 1025,
    smtpSecurity: "starttls",
  },
];

export class UnsupportedImapOperationError extends Error {
  constructor(operation: string) {
    super(`Operation "${operation}" is not supported for IMAP accounts`);
    this.name = "UnsupportedImapOperationError";
  }
}
