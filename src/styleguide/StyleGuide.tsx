import { BrowseCategoryList } from "../components/BrowseCategoryList";
import { BrowseShell } from "../components/BrowseShell";
import { LibraryCard } from "../components/LibraryCard";
import { EmptyPanel } from "../components/EmptyPanel";
import { NavPanel } from "../components/NavPanel";
import { Toast } from "../components/Toast";
import { PlayerControls } from "../components/PlayerControls";
import { PlayerMenu } from "../components/PlayerMenu";
import { RemindersMenu } from "../components/RemindersMenu";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CustomSelect, Icon, ScrollToTop, SearchField, TooltipLayer, type IconName } from "../components/common";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { CardSkeletons, CategorySkeletons, ChannelSkeletons, RowSkeletons, Skeleton } from "../components/Skeleton";

// Dev-only page (npm run dev, then /styleguide.html). It uses the app's real classes and components,
// so a mismatch here is a mismatch in the app. Add new shared UI here when you add it to the app.

const sampleReminder = { id: "s", playlistId: "p", channelId: "c", channelName: "NPO 1", title: "Late Night Talk", startMillis: Date.now() + 3_600_000 };

const TOKENS = [
  "--bg", "--sidebar", "--surface", "--surface-raised", "--surface-hover", "--panel", "--row", "--row-selected",
  "--text", "--muted", "--faint", "--primary", "--primary-hover", "--secondary", "--outline", "--outline-soft",
  "--success", "--danger", "--warning", "--glow", "--glow-strong",
  "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl", "--hover-duration",
];

const ICONS: IconName[] = [
  "home", "live_tv", "movie", "tv", "bookmark", "settings", "play_arrow", "arrow_forward", "check", "download",
  "downloading", "close", "search", "refresh", "add", "favorite", "favorite_border", "library_add", "delete",
  "chevron_left", "chevron_right", "arrow_back", "filter_list", "sort", "error_outline", "info", "fullscreen",
];

const SECTIONS: { name: string; icon: IconName }[] = [
  { name: "Tokens", icon: "brightness_auto" },
  { name: "Typography", icon: "edit" },
  { name: "Buttons", icon: "add" },
  { name: "Icons", icon: "info" },
  { name: "Inputs", icon: "search" },
  { name: "Dropdowns", icon: "expand_more" },
  { name: "Cards", icon: "movie" },
  { name: "Lists", icon: "playlist_play" },
  { name: "Player", icon: "play_arrow" },
  { name: "Browse", icon: "filter_list" },
  { name: "Feedback", icon: "error_outline" },
  { name: "Loading", icon: "refresh" },
  { name: "Pagination", icon: "chevron_right" },
];

function DemoSearch({ initial = "", label = "Search", placeholder = "Search movies" }: { initial?: string; label?: string; placeholder?: string }) {
  const [value, setValue] = useState(initial);
  return <SearchField label={label} onChange={setValue} placeholder={placeholder} value={value} />;
}

function ScrollDemo() {
  const listRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div className="live-channel-list" ref={listRef} style={{ overflowY: "auto" }}>
        {Array.from({ length: 30 }, (_, index) => <p key={index} style={{ margin: 0, padding: "8px 11px" }}>Row {index + 1}</p>)}
      </div>
      <ScrollToTop listRef={listRef} />
    </>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="sg-specimen">
      <h3>{title}</h3>
      {children}
      {note && <p className="sg-note">{note}</p>}
    </div>
  );
}

/** The player as the app builds it: header, picture, our control bar with the menu, speed and extras. */
function PlayerSpecimen({ live, radio = false, notice = false, failed = false, loading = false }: { live: boolean; radio?: boolean; notice?: boolean; failed?: boolean; loading?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  return (
    <section className={`playback-dialog playback-inline${radio ? " is-radio" : ""}`} ref={dialogRef} style={{ maxWidth: 640, position: "static", height: "auto" }}>
      <header className="playback-header">
        <div>
          <h2>{radio ? "Jazz FM" : live ? "Channel name" : "Movie title"}</h2>
          <p className="playback-status" role="status">{live ? "Playing live" : "Playing"}</p>
        </div>
        <div className="playback-header-actions">
          <button aria-label="Close player" className="icon-button" data-tooltip="Close player" type="button"><Icon name="close" /></button>
        </div>
      </header>
      {radio && <div className="playback-radio-art"><Icon name="radio" /></div>}
      <video ref={videoRef} />
      {loading && <ProgressIndicator className="player-loading" label="Loading the stream" />}
      <PlayerControls
        badge={live ? <span className="playback-badge">{radio ? "Radio" : "Live"}</span> : undefined}
        fullscreenRef={dialogRef}
        live={live}
        trailing={<button aria-label="Cast" className="icon-button" data-tooltip="Cast" type="button"><Icon name="cast" /></button>}
        videoRef={videoRef}
      >
        <PlayerMenu
          actions={live ? [] : [{ label: "Search OpenSubtitles…", icon: "search", onClick: () => undefined }]}
          sections={[
            ...(live ? [] : [{ title: "Subtitles", options: [{ label: "Subtitles off", value: "", active: true }, { label: "English", value: "1", active: false }], onSelect: () => undefined }]),
            { title: "Quality", options: [{ label: "Auto", value: "auto", active: true }, { label: "1080p", value: "1080", active: false }], onSelect: () => undefined },
          ]}
        />
        {!live && (
          <div className="player-track-select">
            <Icon name="speed" />
            <CustomSelect ariaLabel="Playback speed" onValueChange={() => undefined} options={[{ label: "Normal speed", value: "1" }, { label: "1.5×", value: "1.5" }]} value="1" variant="embedded" />
          </div>
        )}
        <button aria-label="Open in VLC or mpv" className="icon-button" data-tooltip="Open in VLC or mpv" type="button"><Icon name="open_in_new" /></button>
      </PlayerControls>
      {failed && (
        <>
          <p className="player-error" role="alert">Playback failed. The provider did not answer.</p>
          <div className="playback-error-actions">
            <button className="secondary-button" type="button"><Icon name="refresh" /> Retry playback</button>
            <button className="secondary-button" type="button"><Icon name="arrow_back" /> Return to browsing</button>
            <button className="text-button" type="button"><Icon name="content_copy" /> Copy error details</button>
          </div>
        </>
      )}
      {notice && (
        <p className="player-error" role="status">
          This file has no sound in the built-in player: its audio (usually AC-3 or E-AC-3) cannot be decoded here. Use the Open in VLC or mpv button in the player controls to watch it with sound.
        </p>
      )}
    </section>
  );
}

function Tokens({ theme }: { theme: string }) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(TOKENS.map((name) => [name, style.getPropertyValue(name).trim()])));
  }, [theme]);
  return (
    <div className="sg-swatches">
      {TOKENS.map((name) => (
        <div className="sg-swatch" key={name}>
          <span style={{ background: values[name]?.startsWith("#") || values[name]?.startsWith("rgb") ? `var(${name})` : "transparent" }} />
          <strong>{name}</strong>
          <small>{values[name] || "unset"}</small>
        </div>
      ))}
    </div>
  );
}

function Dropdown({ variant }: { variant: "default" | "compact" }) {
  const [value, setValue] = useState("a");
  return (
    <CustomSelect
      ariaLabel={`${variant} dropdown`}
      onValueChange={setValue}
      options={[{ label: "Option A", value: "a" }, { label: "Option B", value: "b" }, { label: "Option C", value: "c" }]}
      value={value}
      variant={variant}
    />
  );
}

export function StyleGuide() {
  const [theme, setTheme] = useState("dark");
  const [active, setActive] = useState(SECTIONS[0].name);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (visible) setActive(SECTIONS.find(({ name }) => name.toLowerCase() === visible.target.id)?.name ?? SECTIONS[0].name);
    }, { rootMargin: "-10% 0px -70% 0px" });
    document.querySelectorAll(".sg-section").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <TooltipLayer />
      <aside aria-label="Style guide sections" className="sidebar">
        <div className="sidebar-header">
          <a aria-label="TiviHub style guide" className="brand" href="#top">
            <img alt="" src="/icons/tivihub-192.png" />
            <span>TiviHub</span>
          </a>
        </div>
        <nav className="desktop-nav">
          {SECTIONS.map(({ name, icon }) => (
            <a
              aria-current={active === name ? "location" : undefined}
              className={`nav-item${active === name ? " active" : ""}`}
              href={`#${name.toLowerCase()}`}
              key={name}
            >
              <Icon name={icon} />
              <span>{name}</span>
            </a>
          ))}
        </nav>
      </aside>
      <main className="main-content" id="top">
        <header className="page-intro catalog-intro">
          <div>
            <h1>Style guide</h1>
            <p>Every shared component, built from the app's real classes. A mismatch here is a mismatch in the app.</p>
          </div>
          <div className="catalog-controls">
            <button className="secondary-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">
              <Icon name={theme === "dark" ? "light_mode" : "dark_mode"} /> {theme === "dark" ? "Light" : "Dark"} theme
            </button>
          </div>
        </header>

      <section className="sg-section" id="tokens">
        <div className="sg-section-head">
          <h2>Tokens</h2>
          <p>Colour, radius and motion values read live from the current theme.</p>
        </div>
        <div className="sg-specimens">
        <div className="sg-specimen"><Tokens theme={theme} /></div>
        </div>
      </section>

      <section className="sg-section" id="typography">
        <div className="sg-section-head">
          <h2>Typography</h2>
          <p>Headings, eyebrow label, body, muted and faint text.</p>
        </div>
        <div className="sg-specimens">
        <div className="sg-specimen">
          <p className="eyebrow">EYEBROW LABEL</p>
          <h1 style={{ fontSize: "clamp(2.25rem, 5vw, 3.55rem)", letterSpacing: "-0.02em" }}>Page title</h1>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Section heading</h2>
          <p>Body text in the default colour, used for overviews and descriptions.</p>
          <p style={{ color: "var(--muted)" }}>Muted text for secondary information.</p>
          <p style={{ color: "var(--faint)" }}>Faint text for placeholders and hints.</p>
        </div>
        <Block title="Small text sizes" note="Four sizes for everything under 1rem: use the token, never a new rem value. Control text is --text-md.">
          {([["--text-xs", "0.68rem: badges, chips, counts"], ["--text-sm", "0.72rem: meta lines, toasts"], ["--text-md", "0.8rem: buttons, fields, rows"], ["--text-lg", "0.9rem: row titles, body in panels"]] as const).map(([token, use]) => (
            <p key={token} style={{ margin: "4px 0", fontSize: `var(${token})` }}>{token} · {use}</p>
          ))}
        </Block>
        </div>
      </section>

      <section className="sg-section" id="buttons">
        <div className="sg-section-head">
          <h2>Buttons</h2>
          <p>One primary action per view, secondary for the rest, icon buttons for compact actions.</p>
        </div>
        <div className="sg-specimens">
        <Block title="primary-button / secondary-button / text-button">
          <div className="sg-row">
            <button className="primary-button" type="button"><Icon name="play_arrow" /> Watch movie</button>
            <button className="primary-button" disabled type="button"><Icon name="play_arrow" /> Disabled</button>
            <button className="secondary-button" type="button"><Icon name="add" /> Secondary</button>
            <button className="secondary-button selected" type="button"><Icon name="check" /> Selected</button>
            <button className="secondary-button" disabled type="button">Disabled</button>
            <button className="text-button" type="button">Text button</button>
          </div>
        </Block>
        <Block title="icon-button (bare muted icon, grey tile on hover)" note="Hover for the tooltip. Selected turns the icon purple.">
          <div className="sg-row">
            <button aria-label="Refresh" className="icon-button" data-tooltip="Refresh" type="button"><Icon name="refresh" /></button>
            <button aria-label="Favorite" className="icon-button selected" data-tooltip="Selected" type="button"><Icon name="favorite" /></button>
            <button aria-label="Delete" className="icon-button" data-tooltip="Delete" type="button"><Icon name="delete" /></button>
            <button aria-label="Disabled" className="icon-button" disabled type="button"><Icon name="download" /></button>
          </div>
        </Block>
        <Block title="detail-icon-button (movie and series page actions)">
          <div className="sg-row">
            <button aria-label="Add to favorites" className="detail-icon-button favorite" data-tooltip="Add to favorites" type="button"><Icon name="favorite_border" /></button>
            <button aria-label="In favorites" className="detail-icon-button favorite selected" data-tooltip="In favorites" type="button"><Icon name="favorite" /></button>
            <button aria-label="In library" className="detail-icon-button selected" data-tooltip="In library" type="button"><Icon name="check" /></button>
            <button aria-label="Download" className="detail-icon-button" data-tooltip="Download" type="button"><Icon name="download" /></button>
          </div>
        </Block>
        <Block title="source-type-switch (add-source dialog)" note="A row of toggle buttons where one is on. The chosen one gets the purple selection tint.">
          <fieldset className="source-type-switch" style={{ margin: 0 }}>
            <button aria-pressed="true" className="source-type active" type="button"><Icon name="playlist_play" /> M3U</button>
            <button aria-pressed="false" className="source-type" type="button"><Icon name="dns" /> Xtream</button>
            <button aria-pressed="false" className="source-type" disabled type="button"><Icon name="devices" /> Stalker</button>
          </fieldset>
        </Block>
        <Block title="ScrollToTop" note="Appears in the corner of a long list once it is scrolled far down; click to go back to the top. Scroll the list.">
          <div className="live-channel-sidebar" style={{ height: 180 }}>
            <ScrollDemo />
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="icons">
        <div className="sg-section-head">
          <h2>Icons</h2>
          <p>Sizes: 21px actions, 18px inside chips/tabs/secondary buttons, 19px in search fields, 27px placeholder art.</p>
        </div>
        <div className="sg-specimens">
        <Block title="Standard sizes">
          <div className="sg-sizes">
            {[["18px", "chips, tabs, secondary buttons"], ["19px", "search fields"], ["21px", "actions, icon and primary buttons"], ["27px", "placeholder art"]].map(([size, use]) => (
              <div className="sg-size" key={size}>
                <span className="material-icons" style={{ fontSize: size }}>movie</span>
                <strong>{size}</strong>
                {use}
              </div>
            ))}
          </div>
        </Block>
        <Block title="Icon set">
          <div className="sg-icons">
            {ICONS.map((name) => <div className="sg-icon-cell" key={name}><Icon name={name} />{name}</div>)}
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="inputs">
        <div className="sg-section-head">
          <h2>Inputs</h2>
          <p>Search fields are 42px tall with a 0.8rem input and a faint placeholder.</p>
        </div>
        <div className="sg-specimens">
        <Block title="SearchField" note="Every search box. The X appears once something is typed and empties the box.">
          <DemoSearch initial="Matrix" />
        </Block>
        <Block title="topbar-global-search">
          <div className="sg-panel">
            <button className="topbar-global-search global-search-button" style={{ position: "static", transform: "none" }} type="button">
              <Icon name="search" /><span>Search in your library…</span><kbd>Ctrl K</kbd>
            </button>
          </div>
        </Block>
        <Block title="global-search-input (dialog)">
          <label className="global-search-input" style={{ margin: 0 }}>
            <Icon name="search" /><span className="sr-only">Search</span>
            <input placeholder="What are you looking for?" type="search" />
            <kbd aria-hidden="true">ESC</kbd>
          </label>
        </Block>
        <Block title="focus ring" note="Every field has one 2px purple frame on the box that looks like the field (the wrapper of a search or dropdown, the input itself otherwise). Click or tab into each to compare.">
          <div className="sg-panel" style={{ display: "grid", gap: 12, maxWidth: 360 }}>
            <SearchField label="Search" onChange={() => {}} placeholder="search-field" value="" />
            <label className="global-search-input" style={{ margin: 0 }}>
              <Icon name="search" /><span className="sr-only">Search</span>
              <input placeholder="global-search-input" type="search" />
            </label>
            <label className="form-field"><span>form-field</span><input placeholder="Living room" /></label>
          </div>
        </Block>
        <Block title="form-field">
          <label className="form-field" style={{ maxWidth: 360 }}>
            <span>Playlist name <em>Optional</em></span>
            <input placeholder="Living room" />
          </label>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="dropdowns">
        <div className="sg-section-head">
          <h2>Dropdowns</h2>
          <p>Standalone triggers are 38px tall at 0.78rem. Embedded ones live inside a 42px box.</p>
        </div>
        <div className="sg-specimens">
        <Block title="default / compact">
          <div className="sg-row"><div style={{ width: 220 }}><Dropdown variant="default" /></div><Dropdown variant="compact" /></div>
        </Block>
        <Block title="category-select (embedded in a 42px box)">
          <div className="category-select" style={{ maxWidth: 260 }}>
            <Icon name="filter_list" />
            <CustomSelect ariaLabel="Category" onValueChange={() => undefined} options={[{ label: "All categories", value: "all" }]} value="all" variant="embedded" />
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="cards">
        <div className="sg-section-head">
          <h2>Cards</h2>
          <p>Catalog cards with overlay actions, one poster shape for movies, series and channels. Logos, icons and artwork tiles never get a border: they sit on a lighter tone.</p>
        </div>
        <div className="sg-specimens">
        <Block title="catalog-card" note="Movies, series and channels share one poster-shaped card (2:3). A channel adds the LIVE badge and shows its logo whole, padded, on a lighter tile; with no logo it shows the icon like the others.">
          <div className="sg-grid">
            {(["movie", "tv", "live_tv"] as const).map((icon) => (
              <article className={`catalog-card${icon === "live_tv" ? " live-card" : ""}`} key={icon}>
                <button className="catalog-card-main" type="button">
                  <span className="catalog-artwork">
                    <span className="catalog-artwork-fallback"><Icon name={icon} /></span>
                    {icon === "live_tv" && <><img alt="" src="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 60'%3E%3Crect width='120' height='60' rx='6' fill='%23ffd34e'/%3E%3Ctext x='60' y='38' font-family='Arial' font-size='24' font-weight='700' text-anchor='middle' fill='%23222'%3ELOGO%3C/text%3E%3C/svg%3E" /><span className="live-badge"><span /> LIVE</span></>}
                  </span>
                  <span className="catalog-card-copy"><strong>Title of the item</strong><small>Category</small></span>
                </button>
                <button aria-label="Add to favorites" className="favorite-button" data-tooltip="Add to favorites" type="button"><Icon name="favorite_border" /></button>
                {icon !== "live_tv" && <button aria-label="Add to watchlist" className="catalog-library-button" data-tooltip="Add to watchlist" type="button"><Icon name="library_add" /></button>}
              </article>
            ))}
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="lists">
        <div className="sg-section-head">
          <h2>Lists</h2>
          <p>Library, favorites, episodes and downloads share one card rule at the end of styles.css.</p>
        </div>
        <div className="sg-specimens">
        <Block title="LibraryCard" note="Library and Favorites use the catalog card. Library titles carry a delete circle and a status dropdown; favorites a pink heart. A channel is poster-sized with its logo shown whole, padded, on a lighter tile.">
          <div className="movies-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 170px)", gap: 15 }}>
            <LibraryCard contentType="MOVIE" onOpen={() => undefined} onRemove={() => undefined} openLabel="Resume Movie title" progress={45} removeLabel="Remove" removeTooltip="Remove from library" subtitle="Movies" title="Movie title">
              <div className="status-select"><CustomSelect ariaLabel="Status" onValueChange={() => undefined} options={[{ label: "Watching", value: "WATCHING" }]} value="WATCHING" variant="compact" /></div>
            </LibraryCard>
            <LibraryCard artworkUrl="data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 60'%3E%3Crect width='120' height='60' rx='6' fill='%23ffd34e'/%3E%3Ctext x='60' y='38' font-family='Arial' font-size='24' font-weight='700' text-anchor='middle' fill='%23222'%3ELOGO%3C/text%3E%3C/svg%3E" contentType="LIVE" isFavorite onOpen={() => undefined} onRemove={() => undefined} openLabel="Play channel" removeLabel="Remove" removeTooltip="Remove from favorites" subtitle="Live TV" title="Channel with a logo" />
            <LibraryCard contentType="SERIES" isFavorite onOpen={() => undefined} onRemove={() => undefined} openLabel="View details" removeLabel="Remove" removeTooltip="Remove from favorites" subtitle="Series" title="Favorite series" />
          </div>
        </Block>
        <Block title="episode-download-row">
          <div className="episode-list">
            <div className="episode-download-row">
              <button className="episode-row" type="button">
                <span className="episode-play"><Icon name="play_arrow" /></span>
                <span className="episode-copy"><strong>S01 E01 · Pilot</strong><small>A short overview of the episode, clamped to two lines.</small></span>
                <Icon name="arrow_forward" />
              </button>
              <button aria-label="Download" className="icon-button episode-download-action" data-tooltip="Download" type="button"><Icon name="download" /></button>
            </div>
          </div>
        </Block>
        <Block title="home-layout-editor-row (Edit Home)">
          <ol className="home-layout-editor-list" style={{ margin: 0 }}>
            <li className="home-layout-editor-row">
              <label><input defaultChecked type="checkbox" /><span>Continue watching</span></label>
              <div>
                <button aria-label="Move up" className="icon-button home-layout-move-button move-up" disabled type="button"><Icon name="chevron_left" /></button>
                <button aria-label="Move down" className="icon-button home-layout-move-button move-down" type="button"><Icon name="chevron_right" /></button>
              </div>
            </li>
          </ol>
        </Block>
        <Block title="live-channel-list-item">
          <div className="live-channel-list">
            {[{ selected: true, favorite: false }, { selected: false, favorite: true }, { selected: false, favorite: false }].map(({ selected, favorite }) => (
              <article className={`live-channel-list-item${selected ? " selected" : ""}`} key={`${selected}-${favorite}`}>
                <button className="live-channel-select" type="button">
                  <span className="live-channel-list-art"><Icon name="live_tv" /></span>
                  <span className="live-channel-list-copy"><strong>Channel name</strong><small>Group</small></span>
                </button>
                <button aria-label="Favorite" className={`live-channel-favorite${favorite ? " selected" : ""}`} data-tooltip="Favorite" type="button"><Icon name={favorite ? "favorite" : "favorite_border"} /></button>
              </article>
            ))}
          </div>
        </Block>
        <Block title="home-resume (Home, title in progress)">
          <article className="home-resume">
            <span className="home-resume-art"><span className="catalog-artwork-fallback"><Icon name="movie" /></span></span>
            <div className="home-resume-copy">
              <strong>Movie title</strong>
              <small>Movie · 45% watched</small>
              <span className="library-progress"><span style={{ width: "45%" }} /></span>
            </div>
            <button className="primary-button" type="button"><Icon name="play_arrow" />Resume</button>
          </article>
        </Block>
        <Block title="subtitle-panel (player): search-field + results + saved list" note="Results and saved rows use the shared card look. The empty state is an EmptyPanel.">
          <section className="subtitle-panel">
            <div className="subtitle-column">
              <strong className="subtitle-column-title">Search OpenSubtitles</strong>
              <form className="subtitle-search">
                <DemoSearch label="Subtitle search" placeholder="Movie or episode title" />
                <button className="secondary-button selected" type="submit">Search</button>
              </form>
              <ul className="subtitle-results">
                <li>
                  <span><strong>Movie.Title.2024.1080p.srt</strong><small>en · WEB-DL</small></span>
                  <button aria-label="Download" className="icon-button" data-tooltip="Download" type="button"><Icon name="download" /></button>
                </li>
              </ul>
            </div>
            <div className="subtitle-column">
              <strong className="subtitle-column-title">Saved downloads<span className="subtitle-count">1</span></strong>
              <EmptyPanel icon="subtitles" title="Nothing saved yet">Download a subtitle and it will appear here.</EmptyPanel>
            </div>
          </section>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="player">
        <div className="sg-section-head">
          <h2>Player</h2>
          <p>One player look for the modal, inline (Live TV) and mini player: a header with the title and status, the picture edge to edge, and our own control bar drawn over the bottom of it (hidden while the video plays and the pointer is away). Settings, speed, external player and Cast share the bar; every icon button has a tooltip.</p>
        </div>
        <div className="sg-specimens">
        <Block title="PlayerControls + PlayerMenu (movie, episode)" note="Play, seek, time, volume, fullscreen. The settings menu holds subtitles, audio, quality and the subtitle actions; speed is an embedded dropdown that shows as an icon.">
          <PlayerSpecimen live={false} />
        </Block>
        <Block title="Player loading" note="While a stream is prepared or buffering (a recording can take a while): the standard progress bar, 3px, along the top of the picture. It goes away on the first frame or an error.">
          <PlayerSpecimen live={false} loading />
        </Block>
        <Block title="Player error (with actions)" note="The error and its buttons keep the same space below as above.">
          <PlayerSpecimen live={false} failed />
        </Block>
        <Block title="Player notice (no sound)" note="A notice or error under the picture sits as far from the bottom edge as from the picture.">
          <PlayerSpecimen live={false} notice />
        </Block>
        <Block title="PlayerControls (live channel)" note="No seek bar or speed; the Live chip sits left of the volume control. The Live chip is part of the bar, not the header.">
          <PlayerSpecimen live />
        </Block>
        <Block title="playback-dialog.is-radio" note="A station plays as audio in the same player: its logo (or the radio icon) sits in the middle of the picture, the control bar is under it, and the chip says Radio.">
          <PlayerSpecimen live radio />
        </Block>
        <Block title="Multiview tiles" note="Up to four live channels side by side, 16:9 each. The tile with sound has a purple border; the bar over the bottom holds the channel name, a sound button and a remove button.">
          <div className="multiview-grid" data-columns={2}>
            <article className="multiview-tile is-audible">
              <div className="multiview-tile-bar">
                <strong>Channel one</strong>
                <button aria-label="Sound of Channel one" aria-pressed className="icon-button selected" data-tooltip="Sound of Channel one" type="button"><Icon name="volume_up" /></button>
                <button aria-label="Remove Channel one" className="icon-button" data-tooltip="Remove Channel one" type="button"><Icon name="close" /></button>
              </div>
            </article>
            <article className="multiview-tile">
              <div className="multiview-tile-bar">
                <strong>Channel two</strong>
                <button aria-label="Sound of Channel two" aria-pressed={false} className="icon-button" data-tooltip="Sound of Channel two" type="button"><Icon name="volume_off" /></button>
                <button aria-label="Remove Channel two" className="icon-button" data-tooltip="Remove Channel two" type="button"><Icon name="close" /></button>
              </div>
            </article>
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="browse">
        <div className="sg-section-head">
          <h2>Browse</h2>
          <p>Live TV, Movies, Series, TV Guide, Library, Downloads and Settings share one frame: a 320px list on the left, one wide panel beside it, flush against the sidebar.</p>
        </div>
        <div className="sg-specimens">
          <Block title="BrowseCategoryList" note="Favorites and All are pinned above the source's own categories. The selected tile uses the shared selection look.">
            <div className="live-tv-layout browse-layout sg-panel-frame">
              <BrowseCategoryList
                categories={[
                  { id: "@@favorites", name: "Favorites", count: 3, pinned: true },
                  { id: "", name: "All", pinned: true },
                  { id: "news", name: "News", count: 42 },
                  { id: "sport", name: "Sport", count: 1280 },
                  { id: "kids", name: "A category with a long name that is cut off", count: 7 },
                ]}
                loading={false}
                onRetry={() => undefined}
                onSelect={() => undefined}
                selectedId="news"
                title="Live categories"
              />
              <BrowseCategoryList categories={[]} loading onRetry={() => undefined} onSelect={() => undefined} selectedId={null} title="Loading" />
            </div>
          </Block>
          <Block title="NavPanel" note="The left panel of Library, Downloads and Settings: a short fixed list, same tiles as the category list, icon optional, count pill on the right.">
            <div className="live-tv-layout browse-layout sg-panel-frame">
              <NavPanel
                items={[
                  { id: "watching", label: "Continue watching", icon: "play_arrow", count: 3 },
                  { id: "watchlist", label: "Watchlist", icon: "bookmark", count: 12 },
                  { id: "favorites", label: "Favorites", icon: "favorite", count: 0 },
                ]}
                onSelect={() => undefined}
                selectedId="watching"
                title="Library"
              />
            </div>
          </Block>
          <Block title="BrowseShell" note="Heading row (56px) with a count, an optional row of 42px tools, then the content. Empty lists use EmptyPanel inside the panel, never a page-sized empty state.">
            <div className="sg-browse-frame">
              <BrowseShell
                count={0}
                label="Specimen"
                nav={<NavPanel items={[{ id: "a", label: "In progress", icon: "download", count: 0 }, { id: "b", label: "Saved", icon: "check_circle", count: 0 }]} onSelect={() => undefined} selectedId="b" title="Downloads" />}
                title="Saved on this device"
                tools={<DemoSearch placeholder="Search" />}
              >
                <EmptyPanel icon="check_circle" title="Nothing saved yet">Choose Download on a movie or episode to keep it here.</EmptyPanel>
              </BrowseShell>
            </div>
          </Block>
          <Block title="Error" note="A failed request keeps what is on screen and offers Try again; it never leaves a silent gap.">
            <div className="live-tv-layout browse-layout sg-panel-frame">
              <BrowseCategoryList categories={[]} error="Could not reach the provider." loading={false} onRetry={() => undefined} onSelect={() => undefined} selectedId={null} title="Live categories" />
            </div>
          </Block>
        </div>
      </section>

      <section className="sg-section" id="feedback">
        <div className="sg-section-head">
          <h2>Feedback</h2>
          <p>Toasts keep their colour but share one shape. Empty states and progress bars.</p>
        </div>
        <div className="sg-specimens">
        <Block title="Toast" note="A flat raised card with a bar on its left edge: green for a notice, red for an error. One or two sentences, a bare dismiss button. It floats bottom right (above the mobile nav on a phone), one at a time. Playlist expired is the same card in the warning colour, persistent and clickable (it opens the playlist to edit); on a phone it is an icon in the top bar.">
          <div className="sg-stack" style={{ maxWidth: 430 }}>
            <Toast kind="notice" onDismiss={() => undefined}>Source connected. 17,253 live channels. Movies and series load as you open their categories.</Toast>
            <Toast kind="error" onDismiss={() => undefined}>Could not reach the provider.</Toast>
            <button className="topbar-expiry-warning" style={{ justifySelf: "start" }} type="button"><Icon name="error_outline" /><span>Playlist expired</span></button>
          </div>
        </Block>
        <Block title="RemindersMenu (topbar bell)" note="A 42px topbar icon button; the icon is filled once a reminder is set and a 9px purple dot shows while a reminder has fired since the bell was last opened. The panel opens downward under it: Set (with a remove X per row) and Recent (kept after a restart, 20 at most, with Clear recent), rows of title and channel with time (a row whose channel is in the active source is a button that opens it on Live TV, with a live_tv icon), an EmptyPanel when both are empty.">
          <div className="sg-stack" style={{ minHeight: 360 }}>
            <div style={{ justifySelf: "end", position: "relative" }}>
              <RemindersMenu
                canOpen={() => true}
                defaultOpen
                onOpen={() => undefined}
                onClearRecent={() => undefined}
                onMarkSeen={() => undefined}
                onRemove={() => undefined}
                recent={[{ ...sampleReminder, id: "r", title: "Evening News", firedAt: 1, seen: true }]}
                reminders={[sampleReminder]}
                unseen={0}
              />
            </div>
          </div>
        </Block>
        <Block title="EmptyPanel" note="Every empty or failed panel: icon, title, one sentence, at most one button. Errors keep the same shape, tinted, with Try again. The page-sized version (Add your first source, Make Home yours) is HomeEmptyState; it has the same parts, set larger.">
          <div className="sg-stack" style={{ maxWidth: 430 }}>
            <EmptyPanel icon="search" title="No matches">No movies match your search.</EmptyPanel>
            <EmptyPanel action={<button className="secondary-button" type="button"><Icon name="add" /> Add source</button>} icon="playlist_play" title="No sources yet">Add an M3U playlist, an Xtream Codes account or a portal to browse your media.</EmptyPanel>
            <EmptyPanel action={<button className="secondary-button" type="button">Try again</button>} error icon="error_outline" title="Could not load movies">The provider did not answer.</EmptyPanel>
            <EmptyPanel compact icon="schedule" title="No programme information">There is no schedule for this channel.</EmptyPanel>
          </div>
        </Block>
        <Block title="settings update row (inside a settings card)" note="Settings cards sit in the wide panel of the two-panel page; the row inside is plain content, no grey box.">
          <div className="settings-body">
            <div className="settings-content">
              <div className="settings-card">
                <div className="settings-card-heading">
                  <div className="settings-heading-icon"><Icon name="download" /></div>
                  <div><h2>Application updates</h2><p>Check for the latest TiviHub desktop version.</p></div>
                </div>
                <div className="settings-update-row">
                  <div className="settings-update-details">
                    <p className="settings-version">Installed version · v1.9.0</p>
                    <div className="settings-update-status" role="status">
                      <span className="settings-update-indicator current" />
                      <span>Up to date</span>
                    </div>
                  </div>
                  <button className="secondary-button" type="button"><Icon name="refresh" /> Check for updates</button>
                </div>
              </div>
            </div>
          </div>
        </Block>
        <Block title="progress-indicator (indeterminate / 60%)">
          <div className="sg-stack"><ProgressIndicator label="Indeterminate" /><ProgressIndicator label="Determinate" max={100} value={60} /></div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="loading">
        <div className="sg-section-head">
          <h2>Loading</h2>
          <p>Skeletons replace spinners where content will appear.</p>
        </div>
        <div className="sg-specimens">
        <Block title="Skeleton, CardSkeletons, RowSkeletons">
          <div className="sg-stack">
            <div className="sg-row"><Skeleton className="skeleton-line" /><Skeleton className="skeleton-rating" /></div>
            <CardSkeletons count={4} />
            <RowSkeletons count={2} />
          </div>
        </Block>
        <Block title="CategorySkeletons and ChannelSkeletons" note="The Live TV, Movies and Series panels: category rows and channel rows. The poster grid uses GridCardSkeletons inside the panel's own grid.">
          <div className="sg-stack" style={{ maxWidth: 360 }}>
            <CategorySkeletons count={3} />
            <ChannelSkeletons count={2} />
          </div>
        </Block>
        <Block title="RowSkeletons with artwork (downloads)" note="Subtitle results and cast devices use the plain RowSkeletons above.">
          <RowSkeletons artwork count={2} />
        </Block>
        <Block title="Inline skeletons" note="Current-programme line on a Live TV row, player status.">
          <div className="sg-stack" style={{ maxWidth: 360 }}>
            <Skeleton className="skeleton-line" />
            <Skeleton className="skeleton-line playback-status-skeleton" />
          </div>
        </Block>
        <Block title="Work on content already on screen (updating / sorting catalog)" note="A progress bar, not a spinner. Real progress screens keep their own text.">
          <ProgressIndicator label="Updating your catalog" />
        </Block>
        </div>
      </section>

      <section className="sg-section" id="guide-programmes">
        <div className="sg-section-head">
          <h2>TV guide programmes</h2>
          <p>Blocks in the guide timeline. A 3px primary bar marks a finished programme the provider still has a recording of; the programme on air can be started over.</p>
        </div>
        <div className="sg-specimens">
        <Block title="live-guide-program (normal, replayable, current with start over)">
          <div className="live-guide-program-track" style={{ position: "relative", height: 62, width: 560 }}>
            <button className="live-guide-program" style={{ left: 0, width: 150 }} type="button">
              <small>18:00 – 19:00</small><strong>Evening film</strong>
            </button>
            <button className="live-guide-program is-replayable" style={{ left: 156, width: 150 }} type="button">
              <small>19:00 – 20:00</small><strong>Recorded news</strong>
            </button>
            <button className="live-guide-program is-current" style={{ left: 312, width: 200 }} type="button">
              <small>20:00 – 21:30</small><strong>On air now</strong>
            </button>
            <button aria-label="Start over" className="icon-button live-guide-startover" data-tooltip="Start over" style={{ left: 478 }} type="button">
              <Icon name="restart_alt" />
            </button>
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="pagination">
        <div className="sg-section-head">
          <h2>Pagination</h2>
          <p>Catalog pagination bar: range, page size, previous/next.</p>
        </div>
        <div className="sg-specimens">
        <Block title="catalog-pagination">
          <nav aria-label="Pagination" className="catalog-pagination">
            <p className="pagination-range">Showing <strong>1–24</strong> of 240</p>
            <div className="page-size-control"><span>Per page</span><Dropdown variant="compact" /></div>
            <div className="pagination-buttons">
              <button aria-label="Previous page" disabled type="button"><Icon name="chevron_left" /></button>
              <span>Page <strong>1</strong> of 10</span>
              <button aria-label="Next page" type="button"><Icon name="chevron_right" /></button>
            </div>
          </nav>
        </Block>
        </div>
      </section>
      </main>
    </div>
  );
}
