import { useEffect, useRef } from "react";
import { visibleButton } from "../lib/visibleButton";

/** Focus and scroll lock for the blocking "refreshing" overlay; returns the refs the overlay and the refresh action share. */
export function useRefreshOverlay(refreshing: boolean) {
  const refreshOverlayRef = useRef<HTMLDivElement>(null);
  const refreshReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (refreshing) {
      refreshOverlayRef.current?.focus();
      return;
    }
    const returnFocus = refreshReturnFocusRef.current;
    if (!returnFocus) return;
    refreshReturnFocusRef.current = null;
    if (returnFocus.isConnected) returnFocus.focus();
    else visibleButton(".settings-source-refresh")?.focus();
  }, [refreshing]);

  useEffect(() => {
    if (!refreshing) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [refreshing]);

  return { refreshOverlayRef, refreshReturnFocusRef };
}
