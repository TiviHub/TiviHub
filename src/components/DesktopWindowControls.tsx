import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { Window as TauriWindow } from "@tauri-apps/api/window";

function logWindowError(action: string, cause: unknown) {
  console.error(`Could not ${action} the TiviHub window.`, cause);
}

export function DesktopWindowControls() {
  const [desktopWindow, setDesktopWindow] = useState<TauriWindow | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlistenResized: (() => void) | undefined;

    async function initialize() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const currentWindow = getCurrentWindow();
        const currentMaximized = await currentWindow.isMaximized();
        const unlisten = await currentWindow.onResized(() => {
          void currentWindow.isMaximized()
            .then(setMaximized)
            .catch((cause: unknown) => logWindowError("read maximized state for", cause));
        });
        if (disposed) {
          unlisten();
          return;
        }
        unlistenResized = unlisten;
        setDesktopWindow(currentWindow);
        setMaximized(currentMaximized);
      } catch (cause) {
        if (!disposed) logWindowError("initialize controls for", cause);
      }
    }

    void initialize();
    return () => {
      disposed = true;
      unlistenResized?.();
    };
  }, []);

  if (!desktopWindow) return null;

  return (
    <div aria-label="Window controls" className="window-controls">
      <button
        aria-label="Minimize window"
        className="window-control window-control-minimize"
        data-tooltip="Minimize window"
        onClick={() => {
          void desktopWindow.minimize().catch((cause: unknown) => logWindowError("minimize", cause));
        }}
        type="button"
      />
      <button
        aria-label={maximized ? "Restore window" : "Maximize window"}
        className="window-control window-control-maximize"
        data-tooltip={maximized ? "Restore window" : "Maximize window"}
        onClick={() => {
          void desktopWindow.toggleMaximize()
            .then(() => desktopWindow.isMaximized())
            .then(setMaximized)
            .catch((cause: unknown) => logWindowError("toggle maximize for", cause));
        }}
        type="button"
      />
      <button
        aria-label="Close window"
        className="window-control window-control-close"
        data-tooltip="Close window"
        onClick={() => {
          void desktopWindow.close().catch((cause: unknown) => logWindowError("close", cause));
        }}
        type="button"
      />
    </div>
  );
}
