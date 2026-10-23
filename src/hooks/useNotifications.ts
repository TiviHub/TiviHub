import { useEffect, useRef, useState } from "react";

const NOTIFICATION_MILLIS = 3000;

export function useNotifications() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notificationKey, setNotificationKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  function clearNotifications() {
    clearTimer();
    setError(null);
    setNotice(null);
  }

  function notify(message: string, kind: "error" | "notice") {
    clearTimer();
    setNotificationKey((key) => key + 1);
    setError(kind === "error" ? message : null);
    setNotice(kind === "notice" ? message : null);
    timer.current = setTimeout(clearNotifications, NOTIFICATION_MILLIS);
  }

  useEffect(() => clearTimer, []);

  return { error, notice, notificationKey, notify, clearNotifications, setError, setNotice };
}
