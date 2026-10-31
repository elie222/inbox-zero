import { useLayoutEffect, useRef } from "react";
import {
  isMailPerformanceSampled,
  recordThreadSwitchLatency,
} from "@/utils/analytics/mail-performance";

/**
 * In sampled sessions, measures how long the reader takes to show a thread
 * after it is opened (J/K, arrows, Enter or a click all change the open key).
 */
export function useMailPerformanceTelemetry({
  openThreadKey,
  visibleThreadKey,
}: {
  openThreadKey: string | null;
  visibleThreadKey: string | undefined;
}) {
  const pendingSwitch = useRef<{ key: string; startedAt: number } | null>(null);

  useLayoutEffect(() => {
    pendingSwitch.current =
      isMailPerformanceSampled() && openThreadKey
        ? { key: openThreadKey, startedAt: performance.now() }
        : null;
  }, [openThreadKey]);

  useLayoutEffect(() => {
    const pending = pendingSwitch.current;
    if (!pending || pending.key !== visibleThreadKey) return;
    pendingSwitch.current = null;
    recordThreadSwitchLatency(performance.now() - pending.startedAt);
  }, [visibleThreadKey]);
}
