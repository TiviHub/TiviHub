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

export default function LandingPage() {
  const windowsDownloadUrl = import.meta.env.VITE_WINDOWS_DOWNLOAD_URL;

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
