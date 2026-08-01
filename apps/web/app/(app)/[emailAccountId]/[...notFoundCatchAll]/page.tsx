import { notFound } from "next/navigation";

// Unmatched paths under an email account resolve here so they render the
// account-scoped not-found (app shell) with a 404 status, instead of Next's
// root not-found, which is wrapped in the marketing layout. Concrete sibling
// routes take precedence over this catch-all.
export default function NotFoundCatchAll() {
  notFound();
}
