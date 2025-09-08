import { useState, useCallback } from "react";

interface DialogState<T = unknown> {
  isOpen: boolean;
  data?: T;
}

export function useDialogState<T = unknown>(initialState?: DialogState<T>) {
  const [state, setState] = useState<DialogState<T>>(
    initialState || { isOpen: false },
  );

  const onOpen = useCallback((data?: T) => {
    setState({ isOpen: true, data });
  }, []);

  const onClose = useCallback(() => {
    setState({ isOpen: false, data: undefined });
  }, []);

  const onToggle = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: !prev.isOpen }));
  }, []);

  return {
    isOpen: state.isOpen,
    data: state.data,
    onOpen,
    onClose,
    onToggle,
  };
}
