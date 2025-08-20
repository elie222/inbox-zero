import { useEffect } from "react";

export const useSignUpEvent = () => {
  useEffect(() => {
    fetch("/api/user/complete-registration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }).catch((error) => {
      console.error("Failed to complete registration:", error);
    });
  }, []);
};
