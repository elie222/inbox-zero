import { auth } from "@/utils/auth";
import { headers } from "next/headers";
import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { clearUserErrorMessagesAction } from "@/utils/actions/error-messages";
import { getUserErrorMessages } from "@/utils/error-messages";

export async function ErrorMessages() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const errorMessages = await getUserErrorMessages(session.user.id);

  if (!errorMessages || Object.keys(errorMessages).length === 0) return null;

  return (
    <div className="p-2">
      <AlertError
        title="We encountered some errors in your account that need to be fixed:"
        description={
          <>
            <ul className="list-inside list-disc">
              {Object.values(errorMessages).map((error) => (
                <li key={error.message}>{error.message}</li>
              ))}
            </ul>

            {/* Avoids onClick. So it works in server components */}
            <form
              action={clearUserErrorMessagesAction as () => void}
              className="mt-2"
            >
              <Button type="submit" variant="red" size="sm">
                I've fixed them
              </Button>
            </form>
          </>
        }
      />
    </div>
  );
}
