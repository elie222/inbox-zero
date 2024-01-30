import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";

interface Message {
  type: string;
  data: any;
}

export const WithServiceWorker = ({
  callback,
  actions,
  children,
}: PropsWithChildren<{
  callback: Function;
  actions?: Array<string>;
}>) => {
  const [message, setMessage] = useState<Message>();

  const cb = useCallback(callback, [callback]);

  useEffect(
    () =>
      navigator.serviceWorker.addEventListener(
        "message",
        (event: MessageEvent<Message>) => setMessage(event.data),
      ),
    [],
  );

  useEffect(() => {
    if (message && cb) {
      if (actions && actions.length && actions.includes(message.type))
        cb(message);
      else cb(message);
    }
  }, [message, cb, actions]);

  return <>{children}</>;
};
