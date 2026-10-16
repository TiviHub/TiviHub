import { useMemo, useState } from "react";
import type { IconName } from "../components/common";

function LandingIcon({ name }: { name: IconName }) {
  return <span aria-hidden="true" className="material-icons">{name}</span>;
}

const highlights: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "devices",
    title: "Your sources, your choice",
    description: "Connect sources you provide and are authorized to use. TiviHub does not include channels or media.",
  },
  {
    icon: "shield",
    title: "Stored on your device",
    description: "Your playlists, favorites, settings, and progress stay in local app storage.",
  },
  {
    icon: "lock",
    title: "No TiviHub account",
    description: "No TiviHub app server, cloud sync, or analytics. Playback connects directly to your provider.",
  },
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
    answer: "TiviHub supports M3U files and URLs, plus Xtream-compatible sources. Playback includes supported HLS and DASH streams. Whether a particular stream works depends on your provider, authorization, network, codecs, and Windows WebView2.",
    category: "Getting started",
  },
  {
    question: "Where is my library data stored?",
    answer: "Sources, catalogs, favorites, playback progress, and settings are stored locally on your device. TiviHub does not provide an account, application server, cloud sync, or analytics. Keep an encrypted backup if you need to protect against data loss.",
    category: "Privacy",
  },
  {
    question: "Does the player contact TiviHub or my provider?",
    answer: "The installed player is bundled to run locally and has no automatic updater. When you connect a source, refresh content, play media, or search subtitles, it contacts the provider or subtitle service you configured directly. The website host may retain ordinary logs for page visits and downloads.",
    category: "Privacy",
  },
  {
    question: "Which devices can run TiviHub?",
    answer: "The current installer is for 64-bit Windows 10 and Windows 11. It uses the system WebView2 runtime. Linux is not released yet, and macOS is not currently targeted.",
    category: "Compatibility",
  },
  {
    question: "Can TiviHub play DRM-protected streams?",
    answer: "Protected playback requires authorization and a DRM license service from your source. DRM and codec support vary by provider and system; TiviHub does not provide licenses or bypass access controls.",
    category: "Compatibility",
  },
  {
    question: "How do I install an update?",
    answer: "Visit tivihub.nl, download the latest Windows installer, and run it over your existing installation. You do not need to uninstall first. TiviHub has no in-app update check, so keep a backup of important local data.",
    category: "Updates",
  },
];

export default function LandingPage() {
  const windowsDownloadUrl = import.meta.env.VITE_WINDOWS_DOWNLOAD_URL
    || "https://github.com/TiviHub/TiviHub/releases/latest/download/TiviHub-setup.exe";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FaqCategory>("All");
  const filteredFaq = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return faqItems.filter((item) => {
      const matchesCategory = category === "All" || item.category === category;
      const matchesSearch = !query || `${item.question} ${item.answer}`.toLocaleLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [category, search]);

  return (
    <div className="landing-page">
      <header className="landing-header">
        <a aria-label="TiviHub home" className="landing-brand" href="#top">
          <img alt="" height="42" src="/icons/tivihub-192.png" width="42" />
          <span>TiviHub<span className="landing-period">.</span></span>
        </a>
        <nav aria-label="Main navigation" className="landing-nav">
          <a href="#features">Features</a>
          <a href="#privacy">Privacy</a>
          <a href="#faq">FAQ</a>
          <a className="landing-nav-download" href="#download">Download <LandingIcon name="arrow_forward" /></a>
        </nav>
      </header>

      <main id="top">
        <section aria-labelledby="landing-title" className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span>✳</span> DESKTOP PLAYER / YOUR SOURCES</p>
            <h1 id="landing-title">Your media.<br /><span>Your universe.</span></h1>
            <p className="landing-lede">
              A beautifully simple home for the channels, films, and series you choose.
              Bring your own authorized sources. Keep your library on your device.
            </p>
            <div className="landing-download" id="download">
              {windowsDownloadUrl ? (
                <a className="landing-download-button" href={windowsDownloadUrl}>
                  <LandingIcon name="download" />
                  <span>Download for Windows</span>
                  <LandingIcon name="arrow_forward" />
                </a>
              ) : (
                <button className="landing-download-button" disabled type="button">
                  <LandingIcon name="download" />
                  <span>Windows installer coming soon</span>
                </button>
              )}
              <p>
                {windowsDownloadUrl
                  ? "For Windows 10 and 11 · Installer"
                  : "Windows installer is being prepared. Linux may follow after playback testing."}
              </p>
            </div>
            <div className="landing-trust">
              <span><LandingIcon name="check" /> No account</span>
              <span><LandingIcon name="check" /> Local library</span>
              <span><LandingIcon name="check" /> No TiviHub cloud</span>
            </div>
          </div>

          <div aria-hidden="true" className="landing-hero-art">
            <div className="landing-orbit landing-orbit-outer" />
            <div className="landing-orbit landing-orbit-inner" />
            <div className="landing-logo-core">
              <img alt="" src="/icons/tivihub-512.png" />
            </div>
            <span className="landing-art-star landing-art-star-one">✦</span>
            <span className="landing-art-star landing-art-star-two">✧</span>
            <span className="landing-art-caption">TIVIHUB / DESKTOP</span>
            <div className="landing-art-card landing-art-card-top">
              <LandingIcon name="movie" /><span>YOUR LIBRARY</span>
            </div>
            <div className="landing-art-card landing-art-card-bottom">
              <span className="landing-art-pulse" /><span>READY WHEN YOU ARE</span>
            </div>
          </div>
        </section>

        <section aria-label="Privacy summary" className="landing-privacy-strip" id="privacy">
          <div><span className="landing-status-light" /><span>LOCAL-FIRST BY DESIGN</span></div>
          <p>Your sources stay yours. TiviHub doesn’t proxy or host your streams.</p>
        </section>

        <section aria-labelledby="features-title" className="landing-features" id="features">
          <div className="landing-section-heading">
            <div>
              <p className="landing-eyebrow">MADE FOR YOUR MEDIA</p>
              <h2 id="features-title">Your hub. Your rules.</h2>
            </div>
            <p>One desktop app for organizing and playing the sources you configure.</p>
          </div>
          <div className="landing-feature-grid">
            {highlights.map((item, index) => (
              <article className="landing-feature-card" key={item.title}>
                <span className="landing-feature-index">0{index + 1}</span>
                <span className="landing-feature-icon"><LandingIcon name={item.icon} /></span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="faq-title" className="landing-faq" id="faq">
          <div className="landing-section-heading">
            <div>
              <p className="landing-eyebrow">GOOD TO KNOW</p>
              <h2 id="faq-title">Frequently asked questions</h2>
            </div>
            <p>Find clear answers about setup, privacy, compatibility, and updates.</p>
          </div>
          <div className="landing-faq-tools">
            <label className="landing-faq-search">
              <LandingIcon name="search" />
              <span className="visually-hidden">Search frequently asked questions</span>
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search questions..."
                type="search"
                value={search}
              />
            </label>
            <div aria-label="Filter frequently asked questions by topic" className="landing-faq-categories">
              {faqCategories.map((item) => (
                <button
                  aria-pressed={category === item}
                  className={category === item ? "landing-faq-category is-active" : "landing-faq-category"}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="landing-faq-list">
            {filteredFaq.length ? filteredFaq.map((item) => (
              <details className="landing-faq-item" key={item.question}>
                <summary>
                  <span>{item.question}</span>
                  <LandingIcon name="expand_more" />
                </summary>
                <p>{item.answer}</p>
              </details>
            )) : (
              <p className="landing-faq-empty" role="status">No answers match that search. Try another term or topic.</p>
            )}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a aria-label="TiviHub home" className="landing-brand" href="#top">
          <img alt="" height="32" src="/icons/tivihub-192.png" width="32" />
          <span>TiviHub<span className="landing-period">.</span></span>
        </a>
        <p>Player software only. No channels or media are supplied.</p>
        <span>© {new Date().getFullYear()} TiviHub</span>
      </footer>
    </div>
  );
}
