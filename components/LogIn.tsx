import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { getRequest } from "@/utils/api";
import { isErrorMessage } from "@/utils/error";
import { useState } from "react";

export function LogIn(props: {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
    color="transparent"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        const data = await getRequest<{ url: string }>("/api/google/auth-url");
        if (isErrorMessage(data)) {
          console.error("Error getting auth url", data);
        } else {
          router.push(data.url);
        }
        setLoading(false);
      }}
    >
      Log In
    </Button>
  );
}
