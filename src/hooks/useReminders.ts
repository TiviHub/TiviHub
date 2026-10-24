import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { t, tCount } from "../lib/i18n";
import { nextReminderDelay, reminderId, splitReminders } from "../lib/reminders";
import { deleteReminders, getReminders, saveReminder } from "../storage/database";
import { ensureNotificationPermission, sendSystemNotification } from "../services/systemNotification";
import type { EpgProgram, LiveChannel, Reminder } from "../types";

type Notify = (message: string, kind: "error" | "notice") => void;
type Failure = "reminder.loadFailed" | "reminder.saveFailed";
const MAX_RECENT = 20;

function fail(notify: Notify, key: Failure, cause: unknown) {
  console.error(`Reminders: ${key}`, cause);
  notify(t(key), "error");
}

export function useReminders(notify: Notify) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [recent, setRecent] = useState<Reminder[]>([]);
  const refresh = useRef<() => void>(() => undefined);

  const announce = useEffectEvent((due: Reminder[], missed: Reminder[]) => {
    const missedCount = missed.length;
    if (due.length > 0) {
      const message = due.length === 1
        ? t("reminder.soon", { title: due[0].title, channel: due[0].channelName })
        : t("reminder.several", { count: due.length });
      notify(message, "notice");
      // The window already shows the message when it has focus; the system notification is for when it does not.
      if (!document.hasFocus()) void sendSystemNotification(t("reminder.notificationTitle"), message);
    } else if (missedCount > 0) {
      notify(tCount("reminder.missed", missedCount), "notice");
    }
  });
  const report = useEffectEvent((key: Failure, cause: unknown) => fail(notify, key, cause));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function tick() {
      clearTimeout(timer);
      let stored: Reminder[];
      try {
        stored = await getReminders();
      } catch (cause) {
        report("reminder.loadFailed", cause);
        return;
      }
      if (cancelled) return;
      const now = Date.now();
      const { due, missed, upcoming, history } = splitReminders(stored, now);
      let kept = history;
      if (due.length + missed.length > 0) {
        const fired = [
          ...due.map((reminder) => ({ ...reminder, firedAt: now, missed: false, seen: false })),
          ...missed.map((reminder) => ({ ...reminder, firedAt: now, missed: true, seen: false })),
        ];
        kept = [...fired, ...history];
        try {
          for (const reminder of fired) await saveReminder(reminder);
        } catch (cause) {
          report("reminder.saveFailed", cause);
        }
        if (cancelled) return;
        announce(due, missed);
      }
      const stale = kept.slice(MAX_RECENT);
      if (stale.length > 0) await deleteReminders(stale.map((reminder) => reminder.id)).catch(() => undefined);
      setRecent(kept.slice(0, MAX_RECENT));
      setReminders(upcoming);
      const delay = nextReminderDelay(upcoming, Date.now());
      if (delay !== null) timer = setTimeout(() => void tick(), delay);
    }

    refresh.current = () => void tick();
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      refresh.current = () => undefined;
    };
  }, []);

  const reminderIds = useMemo(() => new Set(reminders.map((reminder) => reminder.id)), [reminders]);

  async function toggleReminder(channel: LiveChannel, program: EpgProgram) {
    const id = reminderId(channel.playlistId, channel.id, program.startMillis);
    try {
      if (reminderIds.has(id)) {
        await deleteReminders([id]);
        notify(t("reminder.removed"), "notice");
      } else {
        if (program.startMillis <= Date.now()) return;
        await saveReminder({
          id, playlistId: channel.playlistId, channelId: channel.id, channelName: channel.name,
          title: program.title, startMillis: program.startMillis,
        });
        void ensureNotificationPermission();
        notify(t("reminder.set", { title: program.title }), "notice");
      }
      refresh.current();
    } catch (cause) {
      fail(notify, "reminder.saveFailed", cause);
    }
  }

  async function removeReminder(id: string) {
    try {
      await deleteReminders([id]);
      refresh.current();
    } catch (cause) {
      fail(notify, "reminder.saveFailed", cause);
    }
  }

  async function markSeen() {
    try {
      for (const reminder of recent) if (!reminder.seen) await saveReminder({ ...reminder, seen: true });
      refresh.current();
    } catch (cause) {
      fail(notify, "reminder.saveFailed", cause);
    }
  }

  async function clearRecent() {
    try {
      await deleteReminders(recent.map((reminder) => reminder.id));
      refresh.current();
    } catch (cause) {
      fail(notify, "reminder.saveFailed", cause);
    }
  }

  return {
    reminderIds, reminders, recent, unseen: recent.filter((reminder) => !reminder.seen).length, toggleReminder, removeReminder,
    markSeen,
    clearRecent,
  };
}
