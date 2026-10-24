import { describe, expect, it } from "vitest";
import type { EpgProgram } from "../types";
import { guideDayBounds, guideProgramBlock, guideTimeTicks } from "../lib/liveGuideLayout";

describe("live guide timeline layout", () => {
  const day = new Date(2026, 9, 18);
  const bounds = guideDayBounds(day);

  it("builds local-day ticks every half hour", () => {
    const ticks = guideTimeTicks(bounds, 120);
    expect(ticks).toHaveLength(48);
    expect(ticks[0].left).toBe(0);
    expect(ticks[2].left).toBe(120);
  });

  it("positions programme blocks proportionally within the day", () => {
    const program: EpgProgram = {
      id: "program",
      channelId: "channel",
      title: "Evening news",
      startMillis: bounds.startMillis + 20 * 60 * 60 * 1000,
      endMillis: bounds.startMillis + 21 * 60 * 60 * 1000,
      source: "source",
    };
    expect(guideProgramBlock(program, bounds, 120)).toEqual({ left: 2400, width: 117 });
  });

  it("clips programmes to the selected day and ignores non-overlapping programmes", () => {
    const crossingMidnight: EpgProgram = {
      id: "crossing",
      channelId: "channel",
      title: "Late show",
      startMillis: bounds.startMillis - 60 * 60 * 1000,
      endMillis: bounds.startMillis + 60 * 60 * 1000,
      source: "source",
    };
    const outsideDay = { ...crossingMidnight, startMillis: bounds.endMillis, endMillis: bounds.endMillis + 1000 };
    expect(guideProgramBlock(crossingMidnight, bounds, 120)).toEqual({ left: 0, width: 117 });
    expect(guideProgramBlock(outsideDay, bounds, 120)).toBeNull();
  });
});
