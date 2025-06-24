import { useState, useCallback } from "react";

interface DialogState<T = any> {
  isOpen: boolean;
  data?: T;
}

export function useDialogState<T = any>(initialState?: DialogState<T>) {
  const [state, setState] = useState<DialogState<T>>(
    initialState || { isOpen: false },
  );

  const open = useCallback((data?: T) => {
    setState({ isOpen: true, data });
  }, []);

  const close = useCallback(() => {
    setState({ isOpen: false, data: undefined });
  }, []);

  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  return {
    isOpen: state.isOpen,
    data: state.data,
    open,
    close,
    toggle,
  };
}
