import type { SearchSection } from "../lib/globalSearch";
import { DesktopWindowControls } from "./DesktopWindowControls";
import { Icon, type IconName } from "./common";

type Section = SearchSection;

const ASSET_BASE_URL = import.meta.env.BASE_URL;

const sections: { label: Section; icon: IconName }[] = [
  { label: "Home", icon: "home" },
  { label: "Live TV", icon: "live_tv" },
  { label: "TV Guide", icon: "schedule" },
  { label: "Movies", icon: "theaters" },
  { label: "Series", icon: "tv" },
  { label: "Library", icon: "bookmark_border" },
  { label: "Downloads", icon: "download" },
  { label: "Settings", icon: "settings" },
];

export function Sidebar({
  activeDownloads,
  collapsed,
  inert,
  onNavigate,
  onToggleCollapsed,
  section,
}: {
  activeDownloads: boolean;
  collapsed: boolean;
  inert: boolean;
  onNavigate: (section: Section) => void;
  onToggleCollapsed: () => void;
  section: Section;
}) {
  return (
    <aside
      className="sidebar"
      aria-label="Primary navigation"
      inert={inert}
    >
      <div className="sidebar-header">
        <button aria-label="TiviHub home" className="brand" onClick={() => onNavigate("Home")} type="button">
          <img src={`${ASSET_BASE_URL}icons/tivihub-192.png`} alt="" />
          <span>TiviHub</span>
        </button>
      </div>
      <nav className="desktop-nav" id="desktop-navigation">
        {sections.slice(0, -1).map((item) => (
          <NavItem
            key={item.label}
            icon={item.icon}
            label={item.label}
            active={section === item.label}
            downloading={item.label === "Downloads" && activeDownloads}
            onClick={() => onNavigate(item.label)}
          />
        ))}
      </nav>
      <div className="sidebar-footer">
        <button
          aria-current={section === "Settings" ? "page" : undefined}
          aria-label="Open settings"
          className={`nav-item sidebar-settings-button${section === "Settings" ? " active" : ""}`}
          onClick={() => onNavigate("Settings")}
          data-tooltip="Settings"
          type="button"
        >
          <Icon name="settings" />
          <span>Settings</span>
        </button>
        <div className="sidebar-footer-controls">
          <button
            aria-controls="desktop-navigation"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="sidebar-collapse sidebar-collapse-footer"
            onClick={onToggleCollapsed}
            data-tooltip={collapsed ? "Expand navigation" : "Collapse navigation"}
            type="button"
          >
            <Icon name={collapsed ? "chevron_right" : "chevron_left"} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({
  activeSourceExpired,
  activeSourceName,
  canAdd,
  canOpenGlobalSearch,
  canRefresh,
  onAddSource,
  onNavigate,
  onOpenExpiredPlaylist,
  onOpenGlobalSearch,
  onRefresh,
  section,
}: {
  activeSourceExpired: boolean;
  activeSourceName?: string;
  canAdd: boolean;
  canOpenGlobalSearch: boolean;
  canRefresh: boolean;
  onAddSource: () => void;
  onNavigate: (section: Section) => void;
  onOpenExpiredPlaylist: () => void;
  onOpenGlobalSearch: () => void;
  onRefresh: () => void;
  section: Section;
}) {
  return (
    <header className="topbar">
      <button className="mobile-brand" onClick={() => onNavigate("Home")} type="button">
        <img src={`${ASSET_BASE_URL}icons/tivihub-192.png`} alt="" />
        <span>TiviHub</span>
      </button>
      <button
        aria-keyshortcuts="Control+K Meta+K"
        aria-label="Search your library"
        className="topbar-global-search topbar-desktop-only global-search-button"
        disabled={!canOpenGlobalSearch}
        onClick={onOpenGlobalSearch}
        type="button"
      >
        <Icon name="search" />
        <span>Search in your library…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div aria-hidden="true" className="titlebar-drag-region" data-tauri-drag-region />
      <div className="topbar-desktop-actions topbar-desktop-only">
        <button
          aria-label="Add playlist"
          className="icon-button topbar-action-button"
          disabled={!canAdd}
          onClick={onAddSource}
          data-tooltip="Add playlist"
          type="button"
        >
          <Icon name="add" />
        </button>
        <button
          aria-label="Refresh playlist"
          className="icon-button topbar-action-button refresh-button"
          disabled={!canRefresh}
          onClick={onRefresh}
          data-tooltip="Refresh playlist"
          type="button"
        >
          <Icon name="refresh" />
        </button>
      </div>
      <div className="topbar-actions topbar-mobile-only">
        {activeSourceExpired && (
          <button
            aria-label={`Playlist expired. Edit ${activeSourceName ?? "playlist"}`}
            className="icon-button topbar-expiry-warning topbar-expiry-warning-mobile"
            data-tooltip="Playlist expired. Edit playlist"
            onClick={onOpenExpiredPlaylist}
            type="button"
          >
            <Icon name="error_outline" />
          </button>
        )}
        <button
          aria-keyshortcuts="Control+K Meta+K"
          aria-label="Search your library"
          className="icon-button global-search-button"
          disabled={!canOpenGlobalSearch}
          onClick={onOpenGlobalSearch}
          type="button"
        >
          <Icon name="search" />
        </button>
        <button
          aria-label="Open settings"
          aria-current={section === "Settings" ? "page" : undefined}
          className={`icon-button settings-shortcut${section === "Settings" ? " selected" : ""}`}
          onClick={() => onNavigate("Settings")}
          type="button"
        >
          <Icon name="settings" />
        </button>
      </div>
      <DesktopWindowControls />
    </header>
  );
}

export function MobileNav({
  activeDownloads,
  inert,
  onNavigate,
  section,
}: {
  activeDownloads: boolean;
  inert: boolean;
  onNavigate: (section: Section) => void;
  section: Section;
}) {
  return (
    <nav
      className="mobile-nav"
      aria-label="Primary navigation"
      inert={inert}
    >
      {sections.filter((item) => item.label !== "Settings").map((item) => (
        <NavItem
      key={item.label}
      icon={item.icon}
      label={item.label}
      active={section === item.label}
      downloading={item.label === "Downloads" && activeDownloads}
      onClick={() => onNavigate(item.label)}
      compact
        />
      ))}
    </nav>
  );
}

function NavItem({
  icon,
  label,
  active,
  downloading = false,
  onClick,
  compact = false,
}: {
  icon: IconName;
  label: Section;
  active: boolean;
  downloading?: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`nav-item${active ? " active" : ""}${compact ? " compact" : ""}${downloading ? " is-downloading" : ""}`}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
      <span>{label === "Live TV" && compact ? "Live" : label}</span>
    </button>
  );
}
