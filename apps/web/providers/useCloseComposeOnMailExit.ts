import { useEffect, useRef } from "react";

export function useCloseComposeOnMailExit({
  isMailView,
  closeCompose,
}: {
  isMailView: boolean;
  closeCompose: () => void;
}) {
  const wasMailView = useRef(isMailView);

  useEffect(() => {
    if (wasMailView.current && !isMailView) closeCompose();
    wasMailView.current = isMailView;
  }, [isMailView, closeCompose]);
}
