'use client';

import { createContext, useCallback, useContext, useState } from "react";
import { Notification, NotificationItem } from "@/components/Notification";

const DURATION = 4_000;

interface Context {
  showNotification: (notification?: NotificationItem) => void;
}

const NotificationContext = createContext<Context>({
  showNotification: () => {},
});

export const useNotification = () => useContext<Context>(NotificationContext);

export function NotificationProvider(props: { children: React.ReactNode }) {
  const [notification, setNotification] = useState<
    NotificationItem | undefined
  >();

  const showNotification = useCallback((notification?: NotificationItem) => {
    setNotification(notification);

    setTimeout(
      () => setNotification(undefined),
      notification?.duration || DURATION
    );
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {props.children}
      <Notification
        notification={notification}
        setNotification={setNotification}
      />
    </NotificationContext.Provider>
  );
}
