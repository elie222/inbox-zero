"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface Context {
  prompt?: string;
  filterFunction?: {
    name: string;
    args: Record<string, string>;
  };
  setPrompt: (prompt: string) => void;
  setFunction: (filterFunction: {
    name: string;
    args: Record<string, string>;
  }) => void;
}

const defaultContextValue = {
  setPrompt: () => {},
  setFunction: () => {},
};

const PromptContext = createContext<Context>(defaultContextValue);

export const usePromptContext = () => useContext<Context>(PromptContext);

export const PromptProvider = (props: { children: React.ReactNode }) => {
  const [state, setState] = useState<Context>(defaultContextValue);

  const setPrompt = useCallback(
    (prompt: string) => {
      setState((s) => ({ ...s, prompt }));
    },
    [setState]
  );

  const setFunction = useCallback(
    (filterFunction: { name: string; args: Record<string, string> }) => {
      setState((s) => ({ ...s, filterFunction }));
    },
    [setState]
  );

  return (
    <PromptContext.Provider
      value={{
        prompt: state.prompt,
        filterFunction: state.filterFunction,
        setPrompt,
        setFunction,
      }}
    >
      {props.children}
    </PromptContext.Provider>
  );
};
