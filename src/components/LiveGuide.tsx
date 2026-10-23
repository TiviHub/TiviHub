import { Skeleton } from "./Skeleton";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { EpgProgram, LiveChannel } from "../types";
import { canReplay, canStartOver } from "../lib/catchup";
import { guideDayBounds, guideProgramBlock, guideTimeTicks } from "../lib/liveGuideLayout";
import { CustomSelect, Icon } from "./common";

const CHANNEL_COLUMN_WIDTH = 214;
const GUIDE_OVERSCAN_ROWS = 8;

function channelGuideId(channel: LiveChannel): string {
  return channel.tvgId || channel.id;
}

function formatTime(millis: number): string {
  return new Date(millis).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function LiveGuide({
  channels,
  epg,
  favoriteIds,
  activeChannelId,
  selectedChannelId,
  loading,
  onLoadGuideForChannels,
  onPlay,
  onReplay,
}: {
  channels: LiveChannel[];
  epg: EpgProgram[];
  favoriteIds: ReadonlySet<string>;
  activeChannelId?: string;
  selectedChannelId?: string;
  loading: boolean;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onPlay: (channel: LiveChannel) => void;
  onReplay: (channel: LiveChannel, program: EpgProgram) => void;
}) {
  const [date, setDate] = useState(() => startOfLocalDay(new Date()));
  const [now, setNow] = useState(Date.now());
  const [scope, setScope] = useState("all");
  const [onlyWithEpg, setOnlyWithEpg] = useState(true);
  const [compact, setCompact] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [channelQuery, setChannelQuery] = useState("");
  const [programQuery, setProgramQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadGuideRef = useRef(onLoadGuideForChannels);
  loadGuideRef.current = onLoadGuideForChannels;

  useEffect(() => {
    loadGuideRef.current(channels);
  }, [channels]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const measure = () => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const bounds = useMemo(() => guideDayBounds(date), [date]);
  const hourWidth = 160 * zoomPercent / 100;
  const trackWidth = ((bounds.endMillis - bounds.startMillis) / 3_600_000) * hourWidth;
  const ticks = useMemo(() => guideTimeTicks(bounds, hourWidth), [bounds, hourWidth]);
  const programsByChannel = useMemo(() => {
    const map = new Map<string, EpgProgram[]>();
    for (const program of epg) {
      if (program.endMillis <= bounds.startMillis || program.startMillis >= bounds.endMillis) continue;
      const programs = map.get(program.channelId) ?? [];
      programs.push(program);
      map.set(program.channelId, programs);
    }
    for (const programs of map.values()) programs.sort((left, right) => left.startMillis - right.startMillis);
    return map;
  }, [bounds, epg]);
  const groups = useMemo(
    () => [...new Set(channels.map((channel) => channel.group).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })),
    [channels],
  );
  const normalizedChannelQuery = channelQuery.trim().toLocaleLowerCase();
  const normalizedProgramQuery = programQuery.trim().toLocaleLowerCase();
  const rows = useMemo(() => channels.filter((channel) => {
    const programs = programsByChannel.get(channelGuideId(channel)) ?? [];
    if (scope === "favorites" && !favoriteIds.has(channel.id)) return false;
    if (scope !== "all" && scope !== "favorites" && channel.group !== scope) return false;
    if (normalizedChannelQuery && !channel.name.toLocaleLowerCase().includes(normalizedChannelQuery)) return false;
    if (onlyWithEpg && programs.length === 0) return false;
    if (normalizedProgramQuery && !programs.some((program) => program.title.toLocaleLowerCase().includes(normalizedProgramQuery))) return false;
    return true;
  }), [channels, favoriteIds, normalizedChannelQuery, normalizedProgramQuery, onlyWithEpg, programsByChannel, scope]);
  const rowHeight = compact ? 48 : 62;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - GUIDE_OVERSCAN_ROWS);
  const endIndex = Math.min(
    rows.length,
    Math.ceil((scrollTop + viewportSize.height) / rowHeight) + GUIDE_OVERSCAN_ROWS,
  );
  const visibleRows = rows.slice(startIndex, endIndex);
  const beforeHeight = startIndex * rowHeight;
  const afterHeight = (rows.length - endIndex) * rowHeight;
  const timelineWidth = Math.max(trackWidth, 1);
  const canvasWidth = Math.max(viewportSize.width, CHANNEL_COLUMN_WIDTH + timelineWidth);
  const currentChannel = channels.find((channel) => channel.id === activeChannelId)
    ?? channels.find((channel) => channel.id === selectedChannelId);
  const nowX = now >= bounds.startMillis && now < bounds.endMillis
    ? ((now - bounds.startMillis) / (bounds.endMillis - bounds.startMillis)) * trackWidth
    : null;

  function shiftDay(amount: number) {
    setDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount);
      return next;
    });
  }

  function jumpToNow() {
    const today = startOfLocalDay(new Date());
    setDate(today);
    window.requestAnimationFrame(() => {
      const viewport = scrollRef.current;
      if (!viewport) return;
      const x = ((Date.now() - guideDayBounds(today).startMillis) / 3_600_000) * hourWidth;
      const visibleTimelineWidth = Math.max(0, viewport.clientWidth - CHANNEL_COLUMN_WIDTH);
      viewport.scrollTo({ left: Math.max(0, x - visibleTimelineWidth / 2), behavior: "smooth" });
    });
  }

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const today = startOfLocalDay(new Date());
    const sameDay = date.getTime() === today.getTime();
    const x = sameDay
      ? ((Date.now() - bounds.startMillis) / 3_600_000) * hourWidth
      : 0;
    const visibleTimelineWidth = Math.max(0, viewport.clientWidth - CHANNEL_COLUMN_WIDTH);
    viewport.scrollTo({ left: Math.max(0, x - visibleTimelineWidth / 2), behavior: "auto" });
  }, [bounds, date, hourWidth]);

  const dateLabel = date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <section aria-label="Full TV guide" className="live-guide-workspace">
      <header className="page-intro catalog-intro live-guide-page-heading">
        <div>
          <p className="eyebrow">CHANNELS · PROGRAMME TIMES</p>
          <h1>TV Guide</h1>
          <p>{rows.length.toLocaleString()} of {channels.length.toLocaleString()} channels{loading && <span className="sr-only"> · Loading listings…</span>}</p>
        </div>
        <div className="catalog-controls live-guide-page-controls">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Filter channels</span>
            <input onChange={(event) => setChannelQuery(event.target.value)} placeholder="Filter channels…" value={channelQuery} />
          </label>
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Search programmes</span>
            <input onChange={(event) => setProgramQuery(event.target.value)} placeholder="Search programmes…" value={programQuery} />
          </label>
          <div className="live-guide-select">
            <Icon name="filter_list" />
            <CustomSelect
              ariaLabel="Channel group"
              onValueChange={setScope}
              options={[
                { label: "All", value: "all" },
                { label: "Favorites", value: "favorites" },
                ...groups.map((group) => ({ label: group, value: group })),
              ]}
              value={scope}
              variant="embedded"
            />
          </div>
        </div>
      </header>

      <div className="live-guide-toolbar">
        <div className="live-guide-date-controls">
          <button aria-label="Previous day" className="icon-button" data-tooltip="Previous day" onClick={() => shiftDay(-1)} type="button">
            <Icon name="chevron_left" />
          </button>
          <span>{date.getTime() === startOfLocalDay(new Date()).getTime() ? `Today · ${dateLabel}` : dateLabel}</span>
          <button aria-label="Next day" className="icon-button" data-tooltip="Next day" onClick={() => shiftDay(1)} type="button">
            <Icon name="chevron_right" />
          </button>
          <button className="secondary-button" onClick={jumpToNow} type="button">Now</button>
        </div>
        <label className="live-guide-only-epg">
          <input checked={onlyWithEpg} onChange={(event) => setOnlyWithEpg(event.target.checked)} type="checkbox" />
          <span>Only with EPG</span>
        </label>
        <button
          aria-pressed={compact}
          className={`icon-button${compact ? " selected" : ""}`}
          onClick={() => setCompact((value) => !value)}
          data-tooltip={compact ? "Comfortable row height" : "Compact row height"}
          type="button"
        >
          <Icon name="view_list" />
        </button>
        <label className="live-guide-zoom">
          <Icon name="search" />
          <span className="sr-only">Timeline zoom</span>
          <input
            aria-label={`Timeline zoom (${zoomPercent}%)`}
            max="175"
            min="50"
            onChange={(event) => setZoomPercent(Number(event.target.value))}
            step="5"
            type="range"
            value={zoomPercent}
            data-tooltip={`${zoomPercent}%`}
          />
        </label>
      </div>

      <div
        aria-label="Programme schedule"
        className="live-guide-scroll"
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        ref={scrollRef}
        role="grid"
        style={{ "--live-guide-row-height": `${rowHeight}px` } as CSSProperties}
      >
        <div className="live-guide-canvas" style={{ width: `${canvasWidth}px` }}>
          <div className="live-guide-ruler" style={{ gridTemplateColumns: `${CHANNEL_COLUMN_WIDTH}px ${timelineWidth}px` }}>
            <div aria-label="Channel" className="live-guide-channel-heading">CHANNEL</div>
            <div className="live-guide-ruler-track" style={{ width: `${timelineWidth}px` }}>
              {ticks.map((tick) => (
                <span
                  className={`live-guide-tick${new Date(tick.millis).getMinutes() === 0 ? " is-hour" : ""}`}
                  key={tick.millis}
                  style={{ left: `${tick.left}px` }}
                >
                  {formatTime(tick.millis)}
                </span>
              ))}
              {nowX !== null && (
                <span className="live-guide-now-badge" style={{ left: `${nowX}px` }}>{formatTime(now)}</span>
              )}
            </div>
          </div>

          <div aria-rowcount={rows.length} className="live-guide-rows">
            {beforeHeight > 0 && <div aria-hidden="true" className="live-guide-spacer" style={{ height: `${beforeHeight}px` }} />}
            {visibleRows.map((channel, index) => {
              const programs = programsByChannel.get(channelGuideId(channel)) ?? [];
              const rowIndex = startIndex + index;
              return (
                <div
                  aria-rowindex={rowIndex + 1}
                  className="live-guide-row"
                  key={channel.id}
                  role="row"
                  style={{ gridTemplateColumns: `${CHANNEL_COLUMN_WIDTH}px ${timelineWidth}px`, height: `${rowHeight}px` }}
                >
                  <button
                    aria-label={`Play ${channel.name} live`}
                    className={`live-guide-channel${channel.id === activeChannelId ? " is-playing" : ""}`}
                    onClick={() => onPlay(channel)}
                    role="rowheader"
                    data-tooltip={`${channel.name} · ${channel.group}`}
                    type="button"
                  >
                    <span className="live-guide-channel-logo">
                      {channel.logoUrl ? <img alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} src={channel.logoUrl} /> : <Icon name="live_tv" />}
                    </span>
                    <span className="live-guide-channel-name">
                      <strong>{channel.name}</strong>
                      <small>{channel.group}</small>
                    </span>
                  </button>
                  <div className="live-guide-program-track" role="presentation" style={{ width: `${timelineWidth}px` }}>
                    {ticks.map((tick) => (
                      <span aria-hidden="true" className={`live-guide-gridline${new Date(tick.millis).getMinutes() === 0 ? " is-hour" : ""}`} key={tick.millis} style={{ left: `${tick.left}px` }} />
                    ))}
                    {loading && programs.length === 0 && <Skeleton className="live-guide-program-skeleton" />}
                    {programs.filter((program) =>
                      !normalizedProgramQuery || program.title.toLocaleLowerCase().includes(normalizedProgramQuery),
                    ).map((program) => {
                      const block = guideProgramBlock(program, bounds, hourWidth);
                      if (!block) return null;
                      const isCurrent = program.startMillis <= now && program.endMillis > now;
                      const replayable = canReplay(channel, program, now);
                      const startOver = isCurrent && block.width >= 96 && canStartOver(channel, program, now);
                      return (
                        <Fragment key={program.id}>
                        <button
                          aria-label={`${channel.name}: ${program.title}, ${formatTime(program.startMillis)} to ${formatTime(program.endMillis)}. ${replayable ? "Select to watch the recording." : "Select to play channel live."}`}
                          className={`live-guide-program${isCurrent ? " is-current" : ""}${replayable ? " is-replayable" : ""}`}
                          onClick={() => replayable ? onReplay(channel, program) : onPlay(channel)}
                          style={{ left: `${block.left}px`, width: `${block.width}px` }}
                          data-tooltip={`${program.title} · ${formatTime(program.startMillis)}–${formatTime(program.endMillis)}${replayable ? " · Watch recording" : ""}`}
                          type="button"
                        >
                          <small>{formatTime(program.startMillis)} – {formatTime(program.endMillis)}</small>
                          <strong>{program.title}</strong>
                          {isCurrent && <span className="live-guide-program-progress" style={{ width: `${Math.max(0, Math.min(100, ((now - program.startMillis) / (program.endMillis - program.startMillis)) * 100))}%` }} />}
                        </button>
                        {startOver && (
                          <button
                            aria-label={`Start over ${program.title} on ${channel.name}`}
                            className="icon-button live-guide-startover"
                            data-tooltip="Start over"
                            onClick={() => onReplay(channel, program)}
                            style={{ left: `${block.left + block.width - 34}px` }}
                            type="button"
                          >
                            <Icon name="restart_alt" />
                          </button>
                        )}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {afterHeight > 0 && <div aria-hidden="true" className="live-guide-spacer" style={{ height: `${afterHeight}px` }} />}
            {rows.length === 0 && (
              <p className="live-guide-empty">No channels match these filters.</p>
            )}
          </div>

          {nowX !== null && visibleRows.length > 0 && (
            <span
              aria-hidden="true"
              className="live-guide-now-line"
              style={{
                height: `${visibleRows.length * rowHeight}px`,
                left: `${CHANNEL_COLUMN_WIDTH + nowX}px`,
                top: `${42 + beforeHeight}px`,
              }}
            />
          )}
        </div>
      </div>
      <footer className="live-guide-footer">
        <span>{currentChannel ? `Playing: ${currentChannel.name}` : "Select a channel to start playback"}</span>
        <span>Click a programme to play its channel live. Marked programmes can be watched again.</span>
        {loading && (
          <span className="live-guide-loading" role="status">
            <span className="sr-only">Loading guide data</span>
            <Skeleton className="live-guide-footer-skeleton" />
          </span>
        )}
      </footer>
    </section>
  );
}
