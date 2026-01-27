export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | null {
  const normalizedEmail = email.toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return "Please enter a valid email address";
  }
  return null;
}
