import { describe, expect, it } from "vitest";
import { nextReminderDelay, REMINDER_LEAD_MILLIS, reminderId, splitReminders } from "../lib/reminders";
import type { Reminder } from "../types";

function reminder(startMillis: number): Reminder {
  return { id: reminderId("p", "c", startMillis), playlistId: "p", channelId: "c", channelName: "One", title: "News", startMillis };
}

describe("reminders", () => {
  const now = 1_000_000;

  it("sorts reminders into due, missed and upcoming", () => {
    const missed = reminder(now - 1);
    const startsNow = reminder(now);
    const due = reminder(now + REMINDER_LEAD_MILLIS);
    const upcoming = reminder(now + REMINDER_LEAD_MILLIS + 1);
    const split = splitReminders([upcoming, due, missed, startsNow], now);
    expect(split.missed).toEqual([missed, startsNow]);
    expect(split.due).toEqual([due]);
    expect(split.upcoming).toEqual([upcoming]);
  });

  it("keeps fired reminders as history, newest first, and never fires them again", () => {
    const older = { ...reminder(now - 500), firedAt: now - 400, seen: true };
    const newer = { ...reminder(now - 100), firedAt: now - 50, missed: true };
    const split = splitReminders([older, newer, reminder(now + REMINDER_LEAD_MILLIS + 1)], now);
    expect(split.history).toEqual([newer, older]);
    expect(split.due).toEqual([]);
    expect(split.missed).toEqual([]);
    expect(split.upcoming).toHaveLength(1);
  });

  it("waits until the soonest upcoming reminder is due", () => {
    expect(nextReminderDelay([], now)).toBeNull();
    expect(nextReminderDelay([reminder(now + 600_000), reminder(now + 300_000)], now)).toBe(300_000 - REMINDER_LEAD_MILLIS);
  });

  it("never asks for a timer longer than a browser can run", () => {
    expect(nextReminderDelay([reminder(now + 90 * 24 * 3_600_000)], now)).toBe(2_147_483_647);
  });

  it("gives one programme on one channel of one source the same id every time", () => {
    expect(reminderId("p", "c", 5)).toBe(reminderId("p", "c", 5));
    expect(reminderId("p", "c", 5)).not.toBe(reminderId("q", "c", 5));
  });
});
