import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";

export const WithServiceWorker = ({
  callback,
  actions,
  children,
}: PropsWithChildren<{
  callback: Function;
  actions?: Array<string>;
}>) => {
  const [message, setMessage] = useState<{ type: string; data: any }>();

  const cb = useCallback(callback, [callback]);

  useEffect(
    () =>
      navigator.serviceWorker.addEventListener(
        "message",
        (event: MessageEvent<any>) => setMessage(event.data),
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
