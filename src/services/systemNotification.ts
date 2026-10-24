import { isTauri } from "@tauri-apps/api/core";

async function permitted(ask: boolean): Promise<boolean> {
  if (!isTauri()) return false;
  const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
  if (await isPermissionGranted()) return true;
  return ask && (await requestPermission()) === "granted";
}

/** Asked when a reminder is set, so the system dialog appears at a moment the person understands. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    return await permitted(true);
  } catch (cause) {
    console.error("Could not check the notification permission", cause);
    return false;
  }
}

/** Never throws: the in-app message is the fallback when the system will not show a notification. */
export async function sendSystemNotification(title: string, body: string): Promise<boolean> {
  try {
    if (!(await permitted(false))) return false;
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title, body });
    return true;
  } catch (cause) {
    console.error("Could not show a system notification", cause);
    return false;
  }
}
