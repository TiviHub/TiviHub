import { Skeleton } from "./Skeleton";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { EpgProgram, LiveChannel } from "../types";
import { canReplay, canStartOver } from "../lib/catchup";
import { formatDate, formatTimeOfDay, t } from "../lib/i18n";
import { reminderId } from "../lib/reminders";
import { guideDayBounds, guideProgramBlock, guideTimeTicks } from "../lib/liveGuideLayout";
import { Icon, SearchField } from "./common";
import { BrowseCategoryList, type BrowseCategoryEntry } from "./BrowseCategoryList";
import { BrowseShell } from "./BrowseShell";
import { EmptyPanel } from "./EmptyPanel";

const CHANNEL_COLUMN_WIDTH = 214;
const GUIDE_OVERSCAN_ROWS = 8;

function channelGuideId(channel: LiveChannel): string {
  return channel.tvgId || channel.id;
}

function formatTime(millis: number): string {
  return formatTimeOfDay(millis);
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
  loading,
  onLoadGuideForChannels,
  onPlay,
  onReplay,
  reminderIds,
  onToggleReminder,
  single = false,
}: {
  channels: LiveChannel[];
  epg: EpgProgram[];
  favoriteIds: ReadonlySet<string>;
  activeChannelId?: string;
  loading: boolean;
  onLoadGuideForChannels: (channels: LiveChannel[]) => void;
  onPlay: (channel: LiveChannel) => void;
  onReplay: (channel: LiveChannel, program: EpgProgram) => void;
  /** Programmes that have a reminder, and the way to set or remove one. Without them no bell is shown. */
  reminderIds?: ReadonlySet<string>;
  onToggleReminder?: (channel: LiveChannel, program: EpgProgram) => void;
  /** One channel only (under the player): no page heading, filters, channel column or footer. */
  single?: boolean;
}) {
  const channelColumn = single ? 0 : CHANNEL_COLUMN_WIDTH;
  const [date, setDate] = useState(() => startOfLocalDay(new Date()));
  const [now, setNow] = useState(Date.now());
  const [scope, setScope] = useState("all");
  const [onlyWithEpg, setOnlyWithEpg] = useState(!single);
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
  const columns = single ? `${timelineWidth}px` : `${channelColumn}px ${timelineWidth}px`;
  const canvasWidth = Math.max(viewportSize.width, channelColumn + timelineWidth);
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
      const visibleTimelineWidth = Math.max(0, viewport.clientWidth - channelColumn);
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
    const visibleTimelineWidth = Math.max(0, viewport.clientWidth - channelColumn);
    viewport.scrollTo({ left: Math.max(0, x - visibleTimelineWidth / 2), behavior: "auto" });
  }, [bounds, channelColumn, date, hourWidth]);

  const dateLabel = formatDate(date.getTime(), { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const tools = (
    <>
      <SearchField label={t("guide.filterChannels")} onChange={setChannelQuery} placeholder={t("guide.filterChannels")} value={channelQuery} />
      <SearchField label={t("guide.searchPrograms")} onChange={setProgramQuery} placeholder={t("guide.searchPrograms")} value={programQuery} />
      <div className="live-guide-date-controls">
          <button aria-label={t("guide.prevDay")} className="icon-button" data-tooltip={t("guide.prevDay")} onClick={() => shiftDay(-1)} type="button">
            <Icon name="chevron_left" />
          </button>
          <span>{date.getTime() === startOfLocalDay(new Date()).getTime() ? t("guide.today", { date: dateLabel }) : dateLabel}</span>
          <button aria-label={t("guide.nextDay")} className="icon-button" data-tooltip={t("guide.nextDay")} onClick={() => shiftDay(1)} type="button">
            <Icon name="chevron_right" />
          </button>
          {<button className="secondary-button" onClick={jumpToNow} type="button">{t("guide.now")}</button>}
        </div>
        {(
          <>
            <label className="live-guide-only-epg">
              <input checked={onlyWithEpg} onChange={(event) => setOnlyWithEpg(event.target.checked)} type="checkbox" />
              <span>{t("guide.onlyEpg")}</span>
            </label>
            <button
              aria-pressed={compact}
              className={`icon-button${compact ? " selected" : ""}`}
              onClick={() => setCompact((value) => !value)}
              data-tooltip={compact ? t("guide.rowComfortable") : t("guide.rowCompact")}
              type="button"
            >
              <Icon name="view_list" />
            </button>
          </>
        )}
        {(
          <label className="live-guide-zoom">
            <Icon name="search" />
            <span className="sr-only">{t("guide.zoom")}</span>
            <input
              aria-label={t("guide.zoomAria", { percent: zoomPercent })}
              max="175"
              min="50"
              onChange={(event) => setZoomPercent(Number(event.target.value))}
              step="5"
              type="range"
              value={zoomPercent}
              data-tooltip={`${zoomPercent}%`}
            />
          </label>
        )}
    </>
  );

  const scopeId = scope === "all" ? null : scope === "favorites" ? "@@favorites" : scope;
  const groupCounts = new Map<string, number>();
  for (const channel of channels) groupCounts.set(channel.group, (groupCounts.get(channel.group) ?? 0) + 1);
  const categories: BrowseCategoryEntry[] = [
    { id: "@@favorites", name: t("browse.favorites"), count: channels.filter((channel) => favoriteIds.has(channel.id)).length, pinned: true },
    { id: "", name: t("browse.all"), count: channels.length, pinned: true },
    ...groups.map((group) => ({ id: group, name: group, count: groupCounts.get(group) })),
  ];

  const grid = (
    <>
      <div
      aria-label={t("guide.schedule")}
      className="live-guide-scroll"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={scrollRef}
      role="grid"
      style={{ "--live-guide-row-height": `${rowHeight}px` } as CSSProperties}
    >
      <div className="live-guide-canvas" style={{ width: `${canvasWidth}px` }}>
        <div className="live-guide-ruler" style={{ gridTemplateColumns: columns }}>
          {!single && <div aria-label={t("guide.channelAria")} className="live-guide-channel-heading">{t("guide.channelHeading")}</div>}
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
                style={{ gridTemplateColumns: columns, height: `${rowHeight}px` }}
              >
                {!single && (
                  <button
                    aria-label={t("guide.playLive", { name: channel.name })}
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
                )}
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
                        aria-label={t("guide.programAria", { channel: channel.name, title: program.title, start: formatTime(program.startMillis), end: formatTime(program.endMillis), action: replayable ? t("guide.selectRecording") : t("guide.selectLive") })}
                        className={`live-guide-program${isCurrent ? " is-current" : ""}${replayable ? " is-replayable" : ""}`}
                        onClick={() => replayable ? onReplay(channel, program) : onPlay(channel)}
                        style={{ left: `${block.left}px`, width: `${block.width}px` }}
                        data-tooltip={`${program.title} · ${formatTime(program.startMillis)}–${formatTime(program.endMillis)}${replayable ? ` · ${t("guide.watchRecording")}` : ""}`}
                        type="button"
                      >
                        <small>{formatTime(program.startMillis)} – {formatTime(program.endMillis)}</small>
                        <strong>{program.title}</strong>
                        {isCurrent && <span className="live-guide-program-progress" style={{ width: `${Math.max(0, Math.min(100, ((now - program.startMillis) / (program.endMillis - program.startMillis)) * 100))}%` }} />}
                      </button>
                      {startOver && (
                        <button
                          aria-label={t("guide.startOverAria", { title: program.title, channel: channel.name })}
                          className="icon-button live-guide-startover"
                          data-tooltip={t("guide.startOver")}
                          onClick={() => onReplay(channel, program)}
                          style={{ left: `${block.left + block.width - 34}px` }}
                          type="button"
                        >
                          <Icon name="restart_alt" />
                        </button>
                      )}
                      {onToggleReminder && program.startMillis > now && block.width >= 64 && (() => {
                        const set = reminderIds?.has(reminderId(channel.playlistId, channel.id, program.startMillis)) ?? false;
                        return (
                          <button
                            aria-label={t(set ? "guide.reminderOnAria" : "guide.remindAria", { title: program.title, channel: channel.name })}
                            aria-pressed={set}
                            className={`icon-button live-guide-startover${set ? " selected" : ""}`}
                            data-tooltip={t(set ? "guide.reminderOn" : "guide.remind")}
                            onClick={() => onToggleReminder(channel, program)}
                            style={{ left: `${block.left + block.width - 34}px` }}
                            type="button"
                          >
                            <Icon name={set ? "notifications_active" : "notifications"} />
                          </button>
                        );
                      })()}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {single && !loading && visibleRows.length > 0 && !programsByChannel.get(channelGuideId(visibleRows[0])) && (
            <EmptyPanel compact icon="schedule" title={t("guide.noInfoTitle")}>{t("guide.noInfoBody")}</EmptyPanel>
          )}
          {afterHeight > 0 && <div aria-hidden="true" className="live-guide-spacer" style={{ height: `${afterHeight}px` }} />}
        </div>

        {nowX !== null && visibleRows.length > 0 && (
          <span
            aria-hidden="true"
            className="live-guide-now-line"
            style={{
              height: `${visibleRows.length * rowHeight}px`,
              left: `${channelColumn + nowX}px`,
              top: `${42 + beforeHeight}px`,
            }}
          />
        )}
      </div>
    </div>
    </>
  );

  if (single) {
    return (
      <section aria-label={t("guide.singleAria", { name: channels[0]?.name ?? t("guide.theChannel") })} className="live-guide-workspace is-single">
        {grid}
      </section>
    );
  }

  return (
    <BrowseShell
      bodyClassName="live-guide-body"
      count={rows.length}
      label={t("nav.tvGuide")}
      nav={(
        <BrowseCategoryList
          categories={categories}
          loading={false}
          onRetry={() => undefined}
          onSelect={(id) => setScope(id === null ? "all" : id === "@@favorites" ? "favorites" : id)}
          selectedId={scopeId}
          title={t("guide.groups")}
        />
      )}
      title={t("nav.tvGuide")}
      tools={tools}
    >
      {loading && <span className="sr-only" role="status">{t("guide.loadingListings")}</span>}
      {grid}
      {rows.length === 0 && (
        <EmptyPanel className="live-guide-empty-panel" icon="search" title={t("guide.noMatchTitle")}>{t("guide.noMatchBody")}</EmptyPanel>
      )}
    </BrowseShell>
  );
}
