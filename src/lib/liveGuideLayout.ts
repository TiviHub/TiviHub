import type { EpgProgram } from "../types";

const HALF_HOUR_MILLIS = 30 * 60 * 1000;

export interface GuideDayBounds {
  startMillis: number;
  endMillis: number;
}

export interface GuideTimeTick {
  millis: number;
  left: number;
}

export interface GuideProgramBlock {
  left: number;
  width: number;
}

export function guideDayBounds(date: Date): GuideDayBounds {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startMillis: start.getTime(), endMillis: end.getTime() };
}

export function guideTimeTicks(bounds: GuideDayBounds, hourWidth: number): GuideTimeTick[] {
  const duration = bounds.endMillis - bounds.startMillis;
  const ticks: GuideTimeTick[] = [];
  for (let millis = bounds.startMillis; millis < bounds.endMillis; millis += HALF_HOUR_MILLIS) {
    ticks.push({
      millis,
      left: ((millis - bounds.startMillis) / duration) * (duration / 3_600_000 * hourWidth),
    });
  }
  return ticks;
}

export function guideProgramBlock(
  program: EpgProgram,
  bounds: GuideDayBounds,
  hourWidth: number,
): GuideProgramBlock | null {
  const start = Math.max(program.startMillis, bounds.startMillis);
  const end = Math.min(program.endMillis, bounds.endMillis);
  if (start >= end) return null;
  const duration = bounds.endMillis - bounds.startMillis;
  const trackWidth = duration / 3_600_000 * hourWidth;
  return {
    left: ((start - bounds.startMillis) / duration) * trackWidth,
    width: Math.max(12, ((end - start) / duration) * trackWidth - 3),
  };
}
