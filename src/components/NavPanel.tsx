import { Icon, type IconName } from "./common";

export interface NavPanelItem {
  id: string;
  label: string;
  icon?: IconName;
  count?: number;
}

/** The left panel of a page with a short fixed list (Library, Downloads, Settings): the same tiles as the category list. */
export function NavPanel({ title, items, selectedId, onSelect }: {
  title: string;
  items: NavPanelItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label={title} className="live-channel-sidebar browse-category-panel">
      <div className="live-channel-sidebar-heading">
        <h2>{title}</h2>
      </div>
      <div className="live-channel-list browse-list">
        {items.map((item) => (
          <button
            aria-pressed={selectedId === item.id}
            className={`browse-category${selectedId === item.id ? " active" : ""}`}
            key={item.id}
            onClick={() => onSelect(item.id)}
            type="button"
          >
            <span className="browse-category-name">{item.icon && <Icon name={item.icon} />}{item.label}</span>
            {item.count !== undefined && <span className="browse-category-count">{item.count.toLocaleString()}</span>}
          </button>
        ))}
      </div>
    </nav>
  );
}
