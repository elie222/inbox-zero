import { auth } from "@/utils/auth";
import Link from "next/link";
import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { Button } from "@/components/ui/button";
import { clearUserErrorMessagesAction } from "@/utils/actions/error-messages";
import { getUserErrorMessages } from "@/utils/error-messages";

export async function ErrorMessages() {
  const session = await auth();
  if (!session?.user) return null;

  const errorMessages = await getUserErrorMessages(session.user.id);

  if (!errorMessages || Object.keys(errorMessages).length === 0) return null;

  const errors = Object.values(errorMessages);
  const hasMultipleErrors = errors.length > 1;
  const singleError = errors.length === 1 ? errors[0] : null;

  return (
    <AppAlertBanner
      title="Action Required"
      description={
        <ul className="list-none space-y-1">
          {errors.map((error) => (
            <li key={error.message}>
              {error.message}
              {hasMultipleErrors && error.actionUrl ? (
                <Link className="ml-2 underline" href={error.actionUrl}>
                  {error.actionLabel || "Fix this"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      }
      action={
        <div className="flex items-center gap-2">
          {singleError?.actionUrl ? (
            <Button asChild variant="red" size="sm">
              <Link href={singleError.actionUrl}>
                {singleError.actionLabel || "Fix this"}
              </Link>
            </Button>
          ) : null}
          <form action={clearUserErrorMessagesAction as () => void}>
            <Button
              type="submit"
              variant={singleError?.actionUrl ? "ghost" : "red"}
              size="sm"
            >
              I've fixed them
            </Button>
          </form>
        </div>
      }
    />
  );
}
