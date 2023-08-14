import { ErrorMessage, captureException, isErrorMessage } from "@/utils/error";

export async function postRequest<T, S = any>(
  url: string,
  data: S,
  method?: "POST" | "DELETE"
): Promise<T | ErrorMessage> {
  try {
    const res = await fetch(url, {
      method: method || "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (error) {
    captureException(error);
    if (isErrorMessage(error)) {
      if (error.error === "Failed to fetch" || !navigator.onLine)
        return {
          error: "Please check that you are connected to the Internet.",
        };
      return error;
    }
    return { error: "An error occurred" };
  }
}

export async function getRequest<T>(url: string): Promise<T | ErrorMessage> {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (error) {
    captureException(error);
    if (isErrorMessage(error)) return error;
    return { error: "An error occurred" };
  }
}
