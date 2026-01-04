import { auth } from "@/utils/auth";
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
    <div className="mx-auto max-w-screen-xl w-full px-4 mt-6 mb-2 space-y-2">
      <AlertError
        title="Action Required"
        description={
          <div className="flex flex-col gap-3 mt-2">
            <ul className="list-disc pl-5 space-y-1">
              {Object.values(errorMessages).map((error) => (
                <li key={error.message}>{error.message}</li>
              ))}
            </ul>

            <form action={clearUserErrorMessagesAction as () => void}>
              <Button type="submit" variant="red" size="sm">
                I've fixed them
              </Button>
            </form>
          </div>
        }
      />
    </div>
  );
}
