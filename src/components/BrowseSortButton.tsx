import type { BrowseSort } from "../browse/types";
import { CustomSelect, Icon } from "./common";

/** The icon-only sort menu next to a panel's search box: Default, A–Z or Z–A. */
export function BrowseSortButton({ label, value, onChange }: { label: string; value: BrowseSort; onChange: (sort: BrowseSort) => void }) {
  return (
    <div className="browse-sort">
      <Icon name="sort" />
      <CustomSelect
        ariaLabel={label}
        onValueChange={onChange}
        options={[
          { label: "Default", value: "default" },
          { label: "A–Z", value: "az" },
          { label: "Z–A", value: "za" },
        ]}
        value={value}
        variant="embedded"
      />
    </div>
  );
}
