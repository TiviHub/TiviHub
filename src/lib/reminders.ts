import type { Reminder } from "../types";

/** A reminder fires this long before the programme starts. */
export const REMINDER_LEAD_MILLIS = 60_000;
/** setTimeout cannot wait longer than 2^31 ms (about 24 days); a longer wait is cut into steps. */
const MAX_TIMER_MILLIS = 2_147_483_647;

export function reminderId(playlistId: string, channelId: string, startMillis: number): string {
  return `${playlistId}:${channelId}:${startMillis}`;
}

export interface ReminderSplit {
  /** Time to tell the person: the programme has not started yet. */
  due: Reminder[];
  /** The programme started before the person could be told (the app was closed). */
  missed: Reminder[];
  upcoming: Reminder[];
}

export function splitReminders(reminders: readonly Reminder[], now: number): ReminderSplit {
  const split: ReminderSplit = { due: [], missed: [], upcoming: [] };
  for (const reminder of reminders) {
    if (reminder.startMillis <= now) split.missed.push(reminder);
    else if (reminder.startMillis - REMINDER_LEAD_MILLIS <= now) split.due.push(reminder);
    else split.upcoming.push(reminder);
  }
  return split;
}

/** How long to wait before the next upcoming reminder is due; null when there is none. */
export function nextReminderDelay(upcoming: readonly Reminder[], now: number): number | null {
  if (upcoming.length === 0) return null;
  const soonest = Math.min(...upcoming.map((reminder) => reminder.startMillis - REMINDER_LEAD_MILLIS));
  return Math.min(Math.max(0, soonest - now), MAX_TIMER_MILLIS);
}
