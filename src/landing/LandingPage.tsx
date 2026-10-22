import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { IconName } from "../components/common";

function LandingIcon({ name }: { name: IconName }) {
  return <span aria-hidden="true" className="material-icons" data-icon={name} />;
}

const windowsDownloadUrl = "https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe";
const releasesUrl = "https://github.com/TiviHub/TiviHub/releases/latest";
const repoUrl = "https://github.com/TiviHub/TiviHub";

const platforms = [
  { name: "Windows", detail: "Windows 10/11 (x64) installer", href: windowsDownloadUrl },
  { name: "macOS", detail: "Apple silicon and Intel .dmg", href: releasesUrl },
  { name: "Linux", detail: "x64 AppImage and .deb", href: releasesUrl },
];

const faqCategories = ["All", "Getting started", "Privacy", "Compatibility", "Updates"] as const;
type FaqCategory = (typeof faqCategories)[number];

const faqItems: { question: string; answer: string; category: Exclude<FaqCategory, "All"> }[] = [
  {
    question: "What is TiviHub?",
    answer: "TiviHub is a desktop player and library for sources you configure. It organizes live TV, guide data, movies, series, favorites, and playback progress in one app.",
    category: "Getting started",
  },
  {
    question: "Does TiviHub provide playlists, channels, or streams?",
    answer: "No. TiviHub is player software only. You add sources that you provide and are authorized to use; TiviHub does not supply or host channels, playlists, or media.",
    category: "Getting started",
  },
  {
    question: "Which sources and media formats can I use?",
    answer: "TiviHub supports M3U files and URLs, plus Xtream-compatible sources. Playback includes supported HLS and DASH streams. Whether a particular stream works depends on your provider, authorization, network, and the platform's media runtime and codecs (WebView2 on Windows).",
    category: "Getting started",
  },
  {
    question: "Where is my library data stored?",
    answer: "Sources, catalogs, favorites, playback progress, and settings are stored locally on your device. TiviHub does not provide an account, application server, cloud sync, or analytics. Keep an encrypted backup if you need to protect against data loss.",
    category: "Privacy",
  },
  {
    question: "Does the player contact TiviHub or my provider?",
    answer: "The installed player checks the public GitHub Releases API for updates; that request contains no playlist or library data. When you connect a source, refresh content, play media, or search subtitles, it contacts the provider or subtitle service you configured directly. The website host may retain ordinary logs for page visits and downloads.",
    category: "Privacy",
  },
  {
    question: "Which devices can run TiviHub?",
    answer: "Release packages are available for Windows 10/11 (x64), Linux (x64 AppImage and .deb), and macOS (arm64 and x64 .dmg). The Windows app uses the system WebView2 runtime.",
    category: "Compatibility",
  },
  {
    question: "Can TiviHub play DRM-protected streams?",
    answer: "Protected playback requires authorization and a DRM license service from your source. DRM and codec support vary by provider and system; TiviHub does not provide licenses or bypass access controls.",
    category: "Compatibility",
  },
  {
    question: "How do I install an update?",
    answer: "When a newer release is available, choose the update button at the bottom of the app's sidebar or visit GitHub Releases. Download the package for your platform and follow your operating system's installation prompts. Keep a backup of important local data.",
    category: "Updates",
  },
];

// Mockups of the app with sample data; they illustrate the product, they are not captures.
const navIcons: IconName[] = ["home", "live_tv", "schedule", "theaters", "tv", "bookmark_border", "download"];

function AppWindow({ active, title, sub, children }: { active: number | "settings"; title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="ui app-window" data-nosnippet data-ui>
      <div className="aw-side">
        <span className="aw-logo">
          <svg aria-hidden="true" viewBox="0 0 512 512"><path d="M140 126v220l172-110z" /><rect height="28" width="72" x="340" y="330" /></svg>
        </span>
        {navIcons.map((icon, i) => (
          <span className={active === i ? "aw-nav is-active" : "aw-nav"} key={icon}><LandingIcon name={icon} /></span>
        ))}
        <span className={active === "settings" ? "aw-nav aw-settings is-active" : "aw-nav aw-settings"}><LandingIcon name="settings" /></span>
      </div>
      <div className="aw-main">
        <p className="aw-title">{title}</p>
        {sub && <p className="aw-sub">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

const channelNames = ["Sport Live", "News 24", "Cinema One", "Nature HD", "Music Box", "Kids Zone"];

function LiveWindow() {
  return (
    <AppWindow active={1} sub={`${channelNames.length} channels in this source`} title="Live TV">
      <div className="aw-live">
        <div className="aw-list">
          <p className="ui-title">Channels <span>{channelNames.length}</span></p>
          {channelNames.map((name, i) => (
            <div className={i === 0 ? "aw-channel is-active" : "aw-channel"} key={name}>
              <span>{name}</span>
              <LandingIcon name={i === 2 ? "favorite" : "favorite_border"} />
            </div>
          ))}
        </div>
        <div className="aw-player">
          <span className="ui-live">Live</span>
          <span className="aw-player-title">Sport Live</span>
          <span className="aw-player-sub">Live match · second half</span>
          <span className="aw-controls"><LandingIcon name="play_arrow" /><i /><LandingIcon name="fullscreen" /></span>
        </div>
      </div>
    </AppWindow>
  );
}

function GuideWindow() {
  const rows: [string, [string, number, boolean?][]][] = [
    ["Sport Live", [["Pre-match", 1], ["Live match", 3, true], ["Review", 2]]],
    ["News 24", [["Morning bulletin", 2], ["Weather", 1], ["Late edition", 3]]],
    ["Cinema One", [["Feature film", 4], ["Feature film", 2]]],
    ["Nature HD", [["Wild coasts", 2], ["Night safari", 2], ["Deep blue", 2]]],
    ["Music Box", [["Sessions", 3], ["Charts", 3]]],
  ];
  return (
    <AppWindow active={2} sub={`${rows.length} of ${rows.length} channels`} title="TV Guide">
      <div className="aw-times"><span>14:00</span><span>15:00</span><span>16:00</span></div>
      {rows.map(([channel, shows]) => (
        <div className="ui-slot" key={channel}>
          <span className="ui-channel">{channel}</span>
          <div className="ui-shows" style={{ gridTemplateColumns: shows.map(([, s]) => `${s}fr`).join(" ") }}>
            {shows.map(([show, , live], i) => (
              <span className={live ? "ui-show is-live" : "ui-show"} key={show + i}>{show}</span>
            ))}
          </div>
        </div>
      ))}
    </AppWindow>
  );
}

function LibraryWindow() {
  const shelves: [string, [string, number][]][] = [
    ["Continue watching", [["Harbour Lights", 72], ["The Long Winter", 35], ["Signal Fires", 90], ["Paper Cities", 12]]],
    ["Favorites", [["Night Shift", 0], ["Open Water", 0], ["Glass Hours", 0], ["Low Tide", 0]]],
  ];
  return (
    <AppWindow active={0} title="Home">
      {shelves.map(([shelf, titles]) => (
        <div className="aw-shelf" key={shelf}>
          <p className="ui-title">{shelf}</p>
          <div className="ui-tiles">
            {titles.map(([title, done]) => (
              <div className="ui-tile" key={title}>
                <span className="ui-poster">{title}</span>
                {done > 0 && <span className="ui-progress"><i style={{ width: `${done}%` }} /></span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </AppWindow>
  );
}

function SourcesWindow() {
  const rows = [
    ["Home playlist", "M3U file", "Active"],
    ["Provider login", "Xtream server", "Active"],
    ["Backup list", "M3U URL", "Paused"],
  ];
  return (
    <AppWindow active="settings" sub="Manage this device's local data, sources, and appearance." title="Settings">
      <p className="ui-title">Your sources</p>
      {rows.map(([name, kind, state], i) => (
        <div className={i === 0 ? "ui-row is-active" : "ui-row"} key={name}>
          <span className="ui-name">{name}</span>
          <span className="ui-meta">{kind}</span>
          <span className={state === "Active" ? "ui-chip is-on" : "ui-chip"}>{state}</span>
        </div>
      ))}
      <span className="ui-button">Add another source</span>
    </AppWindow>
  );
}

function DeviceWindow() {
  const kept = ["Playlists", "Favorites", "Settings", "Playback progress"];
  return (
    <AppWindow active="settings" sub="Manage this device's local data, sources, and appearance." title="Settings">
      <p className="ui-title">Privacy by design</p>
      {kept.map((item) => (
        <div className="ui-row" key={item}>
          <span className="ui-name">{item}</span>
          <span className="ui-chip is-on">Local</span>
        </div>
      ))}
      <div className="ui-row ui-row-none">
        <span className="ui-name">TiviHub account or cloud</span>
        <span className="ui-chip">None</span>
      </div>
    </AppWindow>
  );
}

const features: { title: string; text: string[]; fragment: ReactNode }[] = [
  {
    title: "Your sources, your choice",
    text: [
      "Connect M3U files and URLs or Xtream-compatible sources that you provide and are authorized to use.",
      "TiviHub does not include channels, playlists or media.",
    ],
    fragment: <SourcesWindow />,
  },
  {
    title: "Live TV with a guide",
    text: [
      "Browse channels and see what is on now and next, with guide data from your own provider.",
      "Supported HLS and DASH streams play in the app.",
    ],
    fragment: <GuideWindow />,
  },
  {
    title: "Movies and series, remembered",
    text: [
      "Favorites and playback progress live beside your films and series, so you pick up where you stopped.",
    ],
    fragment: <LibraryWindow />,
  },
  {
    title: "Stored on your device",
    text: [
      "Your playlists, favorites, settings and progress stay in local app storage.",
      "No TiviHub app server, no cloud sync, no analytics. Playback connects directly to your provider.",
    ],
    fragment: <DeviceWindow />,
  },
];

export default function LandingPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FaqCategory>("All");
  const [showTop, setShowTop] = useState(false);
  const filteredFaq = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return faqItems.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesSearch = !query || `${item.question} ${item.answer}`.toLocaleLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Entrances only hide content once script runs, so the prerendered page stays readable without it.
  useEffect(() => {
    const root = document.documentElement;
    const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach((item) => observer.observe(item));
    root.classList.add("rv-ready");
    return () => {
      observer.disconnect();
      root.classList.remove("rv-ready");
    };
  }, []);

  return (
    <div className="landing-page">
      <main>
      <section aria-labelledby="landing-title" className="hero">
        <header className="bar">
          <a aria-label="TiviHub home" className="brand" href="#top">
            <img alt="" height="36" src="/icons/tivihub-192.png" width="36" />
            <span>TiviHub</span>
          </a>
          <nav aria-label="Main navigation" className="nav">
            <a href="#features">Features</a>
            <a href="#download">Download</a>
            <a href="#faq">FAQ</a>
            <a href={repoUrl} rel="noopener noreferrer" target="_blank">GitHub</a>
          </nav>
        </header>

        <div className="hero-grid" id="top">
          <div className="hero-copy">
            <h1 data-reveal id="landing-title">Your media. Your universe.</h1>
            <p className="hero-sentence" data-reveal style={{ "--d": "60ms" } as CSSProperties}>
              TiviHub is the desktop player for the channels, films and series you choose.
            </p>
            <div className="hero-actions" data-reveal style={{ "--d": "120ms" } as CSSProperties}>
              <a className="button" href={windowsDownloadUrl}>
                Download for Windows <LandingIcon name="download" />
              </a>
              <a className="textlink" href="#download">Other platforms</a>
            </div>
            <p className="status" data-reveal style={{ "--d": "180ms" } as CSSProperties}>
              <span>no account</span>
              <span>local library</span>
              <span>no cloud</span>
            </p>
          </div>
          <div className="hero-ui" data-reveal style={{ "--d": "100ms" } as CSSProperties}><LiveWindow /></div>
        </div>
      </section>

      <section aria-labelledby="manifesto-title" className="manifesto">
        <h2 data-reveal id="manifesto-title">No account. No cloud.</h2>
        <p data-reveal style={{ "--d": "80ms" } as CSSProperties}>
          No middleman. Your sources stay yours. TiviHub is player software only: it doesn’t proxy or host your streams, and it doesn’t include channels or media.
        </p>
      </section>

      <section aria-labelledby="features-title" className="features" id="features">
        <h2 className="section-title" data-reveal id="features-title">One hub for it all.</h2>
        {features.map((feature) => (
          <article className="feature" key={feature.title}>
            <div className="feature-panel" data-reveal>{feature.fragment}</div>
            <div className="feature-text" data-reveal style={{ "--d": "80ms" } as CSSProperties}>
              <h3>{feature.title}</h3>
              {feature.text.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="download-title" className="platforms" id="download">
        <h2 className="section-title" data-reveal id="download-title">Download TiviHub.</h2>
        <ul>
          {platforms.map((platform, i) => (
            <li data-reveal key={platform.name} style={{ "--d": `${i * 70}ms` } as CSSProperties}>
              <a href={platform.href}>
                <span className="platform-name">{platform.name}</span>
                <LandingIcon name="arrow_forward" />
              </a>
            </li>
          ))}
        </ul>
        <p className="platform-note" data-reveal>
          {platforms.map((platform) => platform.detail).join(" · ")}. Every release is on GitHub.
        </p>
      </section>

      <section aria-labelledby="faq-title" className="faq" id="faq">
        <div className="faq-head">
          <h2 className="section-title" data-reveal id="faq-title">Questions, answered.</h2>
          <div className="faq-tools">
            <label className="faq-search">
              <span className="visually-hidden">Search frequently asked questions</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search questions"
                type="search"
                value={search}
              />
            </label>
            <div aria-label="Filter frequently asked questions by topic" className="faq-categories" role="group">
              {faqCategories.map((item) => (
                <button
                  aria-pressed={category === item}
                  className={category === item ? "chip is-active" : "chip"}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
        {filteredFaq.length ? filteredFaq.map((item) => (
          <article className="faq-row" key={item.question}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </article>
        )) : (
          <p className="faq-empty" role="status">No answers match that search. Try another term or topic.</p>
        )}
      </section>

      <section aria-labelledby="close-title" className="close">
        <h2 data-reveal id="close-title">Add sources. Press play.</h2>
        <div className="close-foot" data-reveal style={{ "--d": "80ms" } as CSSProperties}>
          <p>Free to download. Add your sources and press play.</p>
          <a className="button" href={windowsDownloadUrl}>
            Download for Windows <LandingIcon name="download" />
          </a>
        </div>
      </section>

      </main>

      <a aria-label="Back to top" className={showTop ? "to-top is-visible" : "to-top"} href="#top" tabIndex={showTop ? 0 : -1}>
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4l8 8-1.8 1.8-5.2-5.2V20h-2V8.6l-5.2 5.2L4 12z" /></svg>
      </a>

      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqItems.map(({ question, answer }) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          }),
        }}
        type="application/ld+json"
      />

      <footer className="footer">
        <div className="footer-links">
          <a href={repoUrl} rel="noopener noreferrer" target="_blank">GitHub</a>
          <a href={releasesUrl}>All releases</a>
          <a href="#faq">FAQ</a>
        </div>
        <p className="footer-legal">Player software only. No channels or media are supplied. © {new Date().getFullYear()} TiviHub</p>
        <a aria-label="TiviHub, back to top" className="footer-wordmark" href="#top">
          <span className="wordmark"><span>Tivi</span><span>Hub</span></span>
        </a>
      </footer>
    </div>
  );
}
