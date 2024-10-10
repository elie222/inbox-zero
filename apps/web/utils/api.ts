import {
  type ErrorMessage,
  captureException,
  isErrorMessage,
} from "@/utils/error";

export async function postRequest<T, S = any>(
  url: string,
  data: S,
  method?: "POST" | "DELETE" | "PUT" | "PATCH",
): Promise<T | ErrorMessage> {
  let responseText: string | undefined;
  try {
    const res = await fetch(url, {
      method: method || "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    // we're not using res.json() as sometimes the response is not valid JSON, and in order to capture
    // the response text we need to use res.text()
    responseText = await res.text();
    return JSON.parse(responseText);
    // return await res.json();
  } catch (error) {
    // if json parse error
    const isSyntaxError = error instanceof SyntaxError;

    captureException(isSyntaxError ? responseText : error, {
      extra: {
        url,
        data,
        responseText: responseText?.slice(0, 500), // Limit to first 500 characters
      },
    });

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
