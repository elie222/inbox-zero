import { useEffect, useState } from "react";

interface Message {
  type: string;
  payload: any;
}

export const useServiceWorker = (actions?: string | Array<string>) => {
  const [message, setMessage] = useState<Partial<Message>>({});

  useEffect(() => {
    const handleRegistration = (event: MessageEvent<Message>) => {
      if (event.data) {
        if (actions) {
          if (typeof actions === "string")
            return actions === event.data.type && setMessage(event.data);

          return actions.includes(event.data.type) && setMessage(event.data);
        }
        return setMessage(event.data);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleRegistration);
    return () =>
      navigator.serviceWorker.removeEventListener(
        "message",
        handleRegistration,
      );
  }, [actions]);

  return message;
};
