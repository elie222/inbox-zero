"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";

type Context = {
  handled: Record<string, boolean>;
  toHandleLater: Record<string, boolean>;
  startTime: Date;
  endTime?: Date;
  onSetHandled: (ids: string[]) => void;
  onSetToHandleLater: (ids: string[]) => void;
  onCompleted: () => void;
};

const initialState: Context = {
  handled: {},
  toHandleLater: {},
  startTime: new Date(),
  onSetHandled: () => {},
  onSetToHandleLater: () => {},
  onCompleted: () => {},
};

const SimpleProgressContext = createContext<Context>(initialState);

export const useSimpleProgress = () => useContext(SimpleProgressContext);

export function SimpleEmailStateProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{
    handled: Record<string, boolean>;
    toHandleLater: Record<string, boolean>;
    startTime: Date;
    endTime?: Date;
  }>({
    handled: {},
    toHandleLater: {},
    startTime: new Date(),
  });

  const onSetHandled = useCallback((ids: string[]) => {
    setState((prev) => {
      const newHandled = { ...prev.handled };
      for (const id of ids) {
        newHandled[id] = true;
      }
      return { ...prev, handled: newHandled };
    });
  }, []);

  const onSetToHandleLater = useCallback((ids: string[]) => {
    setState((prev) => {
      const newToHandleLater = { ...prev.toHandleLater };
      for (const id of ids) {
        newToHandleLater[id] = true;
      }
      return { ...prev, toHandleLater: newToHandleLater };
    });
  }, []);

  const onCompleted = useCallback(() => {
    setState((prev) => ({ ...prev, endTime: new Date() }));
  }, []);

  const value = useMemo(() => {
    return {
      ...state,
      onSetHandled,
      onSetToHandleLater,
      onCompleted,
    };
  }, [state, onSetHandled, onSetToHandleLater, onCompleted]);

  return (
    <SimpleProgressContext.Provider value={value}>
      {props.children}
    </SimpleProgressContext.Provider>
  );
}
