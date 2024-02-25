"use client";

import React, { createContext, useCallback, useContext, useMemo } from "react";

type Context = {
  handled: Record<string, boolean>;
  toHandleLater: Record<string, boolean>;
  onSetHandled: (ids: string[]) => void;
  onSetToHandleLater: (ids: string[]) => void;
};

const initialState = {
  handled: {},
  toHandleLater: {},
  onSetHandled: () => {},
  onSetToHandleLater: () => {},
};

const SimpleProgressContext = createContext<Context>(initialState);

export const useSimpleProgress = () => useContext(SimpleProgressContext);

export function SimpleEmailStateProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<{
    handled: Record<string, boolean>;
    toHandleLater: Record<string, boolean>;
  }>({
    handled: {},
    toHandleLater: {},
  });

  const onSetHandled = useCallback((ids: string[]) => {
    setState((prev) => {
      const newHandled = { ...prev.handled };
      ids.forEach((id) => {
        newHandled[id] = true;
      });
      return { ...prev, handled: newHandled };
    });
  }, []);

  const onSetToHandleLater = useCallback((ids: string[]) => {
    setState((prev) => {
      const newToHandleLater = { ...prev.toHandleLater };
      ids.forEach((id) => {
        newToHandleLater[id] = true;
      });
      return { ...prev, toHandleLater: newToHandleLater };
    });
  }, []);

  const value = useMemo(() => {
    return {
      handled: state.handled,
      toHandleLater: state.toHandleLater,
      onSetHandled,
      onSetToHandleLater,
    };
  }, [state, onSetHandled, onSetToHandleLater]);

  return (
    <SimpleProgressContext.Provider value={value}>
      {props.children}
    </SimpleProgressContext.Provider>
  );
}
