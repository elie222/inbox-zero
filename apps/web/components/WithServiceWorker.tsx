import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";

export const WithServiceWorker = ({
  callback,
  children,
}: PropsWithChildren<{ callback: Function }>) => {
  const [message, setMessage] = useState();

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
      cb(message);
    }
  }, [message, cb]);

  return <>{children}</>;
};
