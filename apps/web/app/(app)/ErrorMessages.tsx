import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { clearUserErrorMessagesAction } from "@/utils/actions/error-messages";
import { getUserErrorMessages } from "@/utils/error-messages";

export async function ErrorMessages() {
  const session = await auth();
  if (!session?.user) return null;

  const errorMessages = await getUserErrorMessages(session.user.id);

  if (!errorMessages || Object.keys(errorMessages).length === 0) return null;

  return (
    <div className="p-2">
      <AlertError
        title="Error"
        description={
          <>
            {Object.values(errorMessages).map((error) => (
              <div key={error.message}>{error.message}</div>
            ))}

            {/* Avoids onClick. So it works in server components */}
            <form action={clearUserErrorMessagesAction} className="mt-2">
              <Button type="submit" variant="red">
                Clear
              </Button>
            </form>
          </>
        }
      />
    </div>
  );
}
