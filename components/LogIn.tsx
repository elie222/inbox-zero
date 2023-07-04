import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { getRequest } from "@/utils/api";
import { isErrorMessage } from "@/utils/error";

export function LogIn(props: {}) {
  const router = useRouter();
  return (
    <Button
      onClick={async () => {
        const data = await getRequest<{ url: string }>("/api/google/auth-url");
        if (isErrorMessage(data)) {
          console.error("Error getting auth url", data);
        } else {
          router.push(data.url);
        }
      }}
    >
      Log In
    </Button>
  );
}
