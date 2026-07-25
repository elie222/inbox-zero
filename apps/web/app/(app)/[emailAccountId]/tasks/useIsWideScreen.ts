import { useEffect, useState } from "react";

// The persistent detail pane needs real width; below xl a sheet/overlay
// takes over. Seeded from matchMedia so a wide load doesn't flash.
export function useIsWideScreen() {
  const [wide, setWide] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const update = () => setWide(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return wide;
}
