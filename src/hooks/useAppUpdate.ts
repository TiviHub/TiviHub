import { useCallback, useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import webPackage from "../../package.json";
import { checkForUpdate, type AvailableUpdate } from "../services/updates";

export type UpdateStatus = "idle" | "checking" | "current" | "available" | "error";

const CHECK_INTERVAL_MILLIS = 6 * 60 * 60 * 1000;

export function useAppUpdate(isDesktopApp: boolean) {
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const controller = useRef<AbortController | null>(null);

  const checkUpdates = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setUpdateStatus("checking");
    try {
      const update = await checkForUpdate(webPackage.version, current.signal);
      if (current.signal.aborted) return;
      setAvailableUpdate(update);
      setUpdateStatus(update ? "available" : "current");
    } catch (cause) {
      if (current.signal.aborted) return;
      console.error("Could not check GitHub for TiviHub updates", cause);
      setUpdateStatus("error");
    }
  }, []);

  async function openAvailableUpdate() {
    if (!availableUpdate) return;
    try {
      await openUrl(availableUpdate.installerUrl);
    } catch (cause) {
      console.error("Could not open the TiviHub installer download", cause);
      setUpdateStatus("error");
    }
  }

  useEffect(() => {
    if (!isDesktopApp) return;
    if (import.meta.env.DEV) {
      try {
        if (window.localStorage.getItem("tivihub.debug.simulate-update") === "true") {
          setAvailableUpdate({
            version: `${webPackage.version}-simulated`,
            installerUrl: "https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe",
          });
          setUpdateStatus("available");
          return;
        }
      } catch (cause) {
        console.error("Could not read the TiviHub update simulation setting", cause);
      }
    }
    void checkUpdates();
    const timer = window.setInterval(() => void checkUpdates(), CHECK_INTERVAL_MILLIS);
    return () => {
      window.clearInterval(timer);
      controller.current?.abort();
    };
  }, [checkUpdates, isDesktopApp]);

  return { availableUpdate, updateStatus, checkUpdates, openAvailableUpdate };
}
