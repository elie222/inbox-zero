// Fastmail JMAP scopes
// See: https://www.fastmail.com/dev/
export const SCOPES = [
  // Mail scope - read and manage mail (Mailbox, Thread, Email, SearchSnippet)
  "urn:ietf:params:jmap:mail",
  // Email submission scope - send mail (Identity, EmailSubmission)
  "urn:ietf:params:jmap:submission",
  // Vacation response scope - manage vacation auto-reply
  "urn:ietf:params:jmap:vacationresponse",
];

// Additional scopes that may be useful in the future:
// "urn:ietf:params:jmap:core" - Core JMAP functionality (usually implied)
// "https://www.fastmail.com/dev/maskedemail" - Masked Email functionality
