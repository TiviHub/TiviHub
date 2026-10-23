import { useEffect, useState, type ReactNode } from "react";
import { CustomSelect, Icon, TooltipLayer, type IconName } from "../components/common";
import { ProgressIndicator } from "../components/ProgressIndicator";
import { CardSkeletons, RowSkeletons, Skeleton } from "../components/Skeleton";

// Dev-only page (npm run dev, then /styleguide.html). It uses the app's real classes and components,
// so a mismatch here is a mismatch in the app. Add new shared UI here when you add it to the app.

const TOKENS = [
  "--bg", "--sidebar", "--surface", "--surface-raised", "--surface-hover", "--panel", "--row", "--row-selected",
  "--text", "--muted", "--faint", "--primary", "--primary-hover", "--secondary", "--outline", "--outline-soft",
  "--success", "--danger", "--glow", "--glow-strong",
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
  { name: "Tabs", icon: "view_list" },
  { name: "Cards", icon: "movie" },
  { name: "Lists", icon: "playlist_play" },
  { name: "Feedback", icon: "error_outline" },
  { name: "Loading", icon: "refresh" },
  { name: "Pagination", icon: "chevron_right" },
];

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="sg-specimen">
      <h3>{title}</h3>
      {children}
      {note && <p className="sg-note">{note}</p>}
    </div>
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
        <Block title="search-field">
          <label className="search-field"><Icon name="search" /><span className="sr-only">Search</span><input placeholder="Search movies" /></label>
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

      <section className="sg-section" id="tabs">
        <div className="sg-section-head">
          <h2>Tabs</h2>
          <p>Grey tiles, purple selection bar on the active tab.</p>
        </div>
        <div className="sg-specimens">
        <Block title="library-tabs / library-content-tabs">
          <div className="library-tabs" role="group">
            <button className="active" type="button">Continue watching<span>3</span></button>
            <button type="button">Watchlist<span>12</span></button>
            <button type="button">Watched<span>0</span></button>
          </div>
          <div className="library-content-tabs" role="group">
            <button className="active" type="button">All<span>3</span></button>
            <button type="button"><Icon name="movie" />Movies<span>2</span></button>
            <button type="button"><Icon name="tv" />Series<span>1</span></button>
          </div>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="cards">
        <div className="sg-section-head">
          <h2>Cards</h2>
          <p>Catalog cards with overlay actions, in poster and live (16:9) shapes.</p>
        </div>
        <div className="sg-specimens">
        <Block title="catalog-card">
          <div className="sg-grid">
            {(["movie", "tv", "live_tv"] as const).map((icon) => (
              <article className={`catalog-card${icon === "live_tv" ? " live-card" : ""}`} key={icon}>
                <button className="catalog-card-main" type="button">
                  <span className="catalog-artwork">
                    <span className="catalog-artwork-fallback"><Icon name={icon} /></span>
                    {icon === "live_tv" && <span className="live-badge"><span /> LIVE</span>}
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
        <Block title="library-item">
          <div className="library-items">
            <article className="library-item">
              <button className="library-item-main" type="button">
                <span className="library-item-art"><span className="library-item-art-fallback"><Icon name="movie" /></span></span>
                <span className="library-item-copy"><strong>Movie title</strong><small>Parent title</small><span className="library-progress"><span style={{ width: "45%" }} /></span></span>
              </button>
              <div className="status-select"><Dropdown variant="compact" /></div>
              <button aria-label="Remove" className="icon-button" data-tooltip="Remove from library" type="button"><Icon name="delete" /></button>
            </article>
          </div>
        </Block>
        <Block title="favorite-row">
          <div className="favorite-list">
            <article className="favorite-row">
              <button aria-label="View details" className="favorite-art-button" type="button"><span className="library-item-art-fallback"><Icon name="tv" /></span></button>
              <div><strong>Series title</strong><small>Series</small></div>
              <button aria-label="Play" className="icon-button" data-tooltip="Play" type="button"><Icon name="play_arrow" /></button>
              <button aria-label="Remove" className="icon-button is-favorite" data-tooltip="Remove from favorites" type="button"><Icon name="favorite" /></button>
            </article>
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
        <Block title="subtitle-panel (player): search-field + results + saved list" note="Results and saved rows use the shared card look. The empty card replaces plain hint text.">
          <section className="subtitle-panel">
            <div className="subtitle-column">
              <strong className="subtitle-column-title">Search OpenSubtitles</strong>
              <form className="subtitle-search">
                <label className="search-field"><Icon name="search" /><input aria-label="Subtitle search" placeholder="Movie or episode title" /></label>
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
              <div className="subtitle-empty"><Icon name="subtitles" /><p>Nothing saved yet. Download a subtitle and it will appear here.</p></div>
            </div>
          </section>
        </Block>
        <Block title="playback-badge (Live chip in the player header, modal, inline and mini)">
          <h2 style={{ margin: 0 }}><span className="playback-badge">Live</span>Channel name</h2>
        </Block>
        </div>
      </section>

      <section className="sg-section" id="feedback">
        <div className="sg-section-head">
          <h2>Feedback</h2>
          <p>Toasts keep their colour but share one shape. Empty states and progress bars.</p>
        </div>
        <div className="sg-specimens">
        <Block title="notification-toast">
          <div className="sg-stack" style={{ maxWidth: 430 }}>
            <div className="app-message notification-toast notice-message"><Icon name="check_circle" /><span>Playlist refreshed.</span><button aria-label="Dismiss" type="button"><Icon name="close" /></button></div>
            <div className="app-message notification-toast error-message"><Icon name="error_outline" /><span>Could not reach the provider.</span><button aria-label="Dismiss" type="button"><Icon name="close" /></button></div>
            <button className="topbar-expiry-warning" style={{ justifySelf: "start" }} type="button"><Icon name="error_outline" /><span>Playlist expired</span></button>
          </div>
        </Block>
        <Block title="catalog-empty">
          <div className="catalog-empty compact-empty"><Icon name="search" /><h2>No matches</h2><p>Try another title or clear your filters.</p></div>
        </Block>
        <Block title="settings update row (inside a settings card)">
          <div className="settings-page" style={{ padding: 0 }}>
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
        <Block title="CardSkeletons live (Live TV channels)">
          <CardSkeletons count={3} live />
        </Block>
        <Block title="RowSkeletons with artwork (downloads)" note="Subtitle results and cast devices use the plain RowSkeletons above.">
          <RowSkeletons artwork count={2} />
        </Block>
        <Block title="Inline skeletons" note="Current-programme line on a Live TV row, TV Guide footer, player status.">
          <div className="sg-stack" style={{ maxWidth: 360 }}>
            <Skeleton className="skeleton-line" />
            <Skeleton className="live-guide-footer-skeleton" />
            <Skeleton className="skeleton-line playback-status-skeleton" />
          </div>
        </Block>
        <Block title="Work on content already on screen (updating / sorting catalog)" note="A progress bar, not a spinner. Real progress screens keep their own text.">
          <ProgressIndicator label="Updating your catalog" />
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
