import { auth } from "@/utils/auth";
import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { Button } from "@/components/ui/button";
import { clearUserErrorMessagesAction } from "@/utils/actions/error-messages";
import { getUserErrorMessages } from "@/utils/error-messages";

export async function ErrorMessages() {
  const session = await auth();
  if (!session?.user) return null;

  const errorMessages = await getUserErrorMessages(session.user.id);

  if (!errorMessages || Object.keys(errorMessages).length === 0) return null;

  return (
    <AppAlertBanner
      title="Action Required"
      description={Object.values(errorMessages).map((error) => (
        <p key={error.message}>{error.message}</p>
      ))}
      action={
        <form action={clearUserErrorMessagesAction as () => void}>
          <Button type="submit" variant="red" size="sm">
            I've fixed them
          </Button>
        </form>
      }
    />
  );
}
