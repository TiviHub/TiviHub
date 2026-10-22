import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";

type HorizontalDragTrackProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "className" | "onClickCapture" | "onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
> & {
  className: string;
  children: ReactNode;
};

export function HorizontalDragTrack({
  className,
  children,
  ...attributes
}: HorizontalDragTrackProps) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const activeDrag = drag.current;
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (activeDrag.moved) {
      window.setTimeout(() => { suppressClick.current = false; }, 0);
    }
  }

  return (
    <div
      {...attributes}
      className={`${className}${dragging ? " is-dragging" : ""}`}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onPointerCancel={finishDrag}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScrollLeft: event.currentTarget.scrollLeft,
          moved: false,
        };
      }}
      onPointerMove={(event) => {
        const activeDrag = drag.current;
        if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
        const offset = event.clientX - activeDrag.startX;
        if (!activeDrag.moved && Math.abs(offset) > 5) {
          activeDrag.moved = true;
          suppressClick.current = true;
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (activeDrag.moved) {
          event.preventDefault();
          event.currentTarget.scrollLeft = activeDrag.startScrollLeft - offset;
        }
      }}
      onPointerUp={finishDrag}
    >
      {children}
    </div>
  );
}

export type IconName =
  | "home"
  | "live_tv"
  | "movie"
  | "theaters"
  | "tv"
  | "bookmark"
  | "bookmark_border"
  | "settings"
  | "play_arrow"
  | "arrow_forward"
  | "devices"
  | "cast"
  | "cast_connected"
  | "shield"
  | "light_mode"
  | "dark_mode"
  | "brightness_auto"
  | "check"
  | "download"
  | "downloading"
  | "folder"
  | "folder_open"
  | "delete_sweep"
  | "close"
  | "playlist_play"
  | "dns"
  | "lock"
  | "link"
  | "add"
  | "refresh"
  | "favorite"
  | "favorite_border"
  | "search"
  | "filter_list"
  | "sort"
  | "schedule"
  | "chevron_left"
  | "chevron_right"
  | "delete"
  | "edit"
  | "expand_more"
  | "arrow_back"
  | "subtitles"
  | "library_add"
  | "more_vert"
  | "view_list"
  | "fullscreen"
  | "graphic_eq"
  | "high_quality"
  | "speed"
  | "picture_in_picture"
  | "picture_in_picture_alt"
  | "horizontal_rule"
  | "crop_square"
  | "filter_none"
  | "restore"
  | "backup"
  | "check_circle"
  | "error_outline"
  | "info"
  | "content_copy"
  | "logout";

export function Icon({ name }: { name: IconName }) {
  const iconRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const button = iconRef.current?.closest("button");
    if (!button) return;
    if (button.title) {
      button.dataset.tooltip ??= button.title;
      button.removeAttribute("title");
      return;
    }
    if (button.dataset.tooltip) return;
    const clone = button.cloneNode(true) as HTMLButtonElement;
    clone.querySelectorAll(".material-icons").forEach((icon) => icon.remove());
    const label = button.getAttribute("aria-label")?.trim() || clone.textContent?.trim() || "";
    if (label) button.dataset.tooltip = label;
  }, [name]);

  return <span aria-hidden="true" className="material-icons" ref={iconRef}>{name}</span>;
}

type TooltipState = {
  text: string;
  target: HTMLElement;
};

export function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const activeTargetRef = useRef<HTMLElement | null>(null);
  const activeTextRef = useRef("");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!tooltip || !tooltipRef.current) return;
    const floatingElement = tooltipRef.current;
    const referenceElement = tooltip.target.matches(".episode-row")
      ? tooltip.target.querySelector<HTMLElement>(".episode-play") ?? tooltip.target
      : tooltip.target;
    const updatePosition = () => {
      const placement = tooltip.target.dataset.tooltipPlacement;
      void computePosition(referenceElement, floatingElement, {
        placement: placement === "bottom" || placement === "left"
          ? placement
          : tooltip.target.closest(".sidebar")
            ? "right"
            : "top",
        strategy: "fixed",
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => setPosition({ x, y }));
    };
    return autoUpdate(referenceElement, floatingElement, updatePosition);
  }, [tooltip]);

  useEffect(() => {
    const clearTooltip = () => {
      activeTargetRef.current = null;
      activeTextRef.current = "";
      setPosition(null);
      setTooltip(null);
    };
    const showTooltip = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const element = target.closest<HTMLElement>("button:not(.global-search-button)");
      const text = element?.dataset.tooltip?.trim() || element?.getAttribute("aria-label")?.trim();
      const isNavigationButton = Boolean(element?.closest(".sidebar, .topbar"));
      // Buttons that already show a text label do not need a tooltip; only icon-only ones do.
      const hasVisibleLabel = Boolean(element && !element.closest(".sidebar, .topbar") && [...element.childNodes].some((node) => !(node instanceof Element && node.classList.contains("material-icons")) && node.textContent?.trim()));
      const isEpisodeAction = Boolean(element?.matches(".episode-row, .episode-download-action"));
      const isLibraryAction = Boolean(element?.matches(".catalog-library-button, .library-action"));
      const isSourceAction = Boolean(element?.matches(".settings-source-action"));
      const isIconAction = Boolean(element?.matches(".icon-button, .favorite-button, .live-channel-favorite, .catalog-library-button"));
      if (
        !element ||
        element.closest(".global-search-dialog") ||
        !text ||
        hasVisibleLabel ||
        (!isNavigationButton && !isIconAction && !isEpisodeAction && !isLibraryAction && !isSourceAction)
      ) return;
      if (activeTargetRef.current === element && activeTextRef.current === text) return;

      activeTargetRef.current = element;
      activeTextRef.current = text;
      setPosition(null);
      setTooltip({ text, target: element });
    };
    const handlePointerOut = (event: PointerEvent) => {
      const activeTarget = activeTargetRef.current;
      if (!activeTarget || (event.relatedTarget instanceof Node && activeTarget.contains(event.relatedTarget))) return;
      clearTooltip();
    };
    const handleFocusOut = (event: FocusEvent) => {
      const activeTarget = activeTargetRef.current;
      if (!activeTarget || (event.relatedTarget instanceof Node && activeTarget.contains(event.relatedTarget))) return;
      if (activeTarget.matches(":hover")) return;
      clearTooltip();
    };
    const handlePointerOver = (event: PointerEvent) => showTooltip(event.target);
    const handleFocusIn = (event: FocusEvent) => showTooltip(event.target);

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
    };
  }, []);

  if (!tooltip) return null;
  return createPortal(
    <div
      className="app-tooltip"
      ref={tooltipRef}
      role="tooltip"
      style={position ? { position: "fixed", left: position.x, top: position.y } : { position: "fixed" }}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}

export type CustomSelectOption<Value extends string = string> = {
  value: Value;
  label: string;
  disabled?: boolean;
};

export function CustomSelect<Value extends string = string>({
  ariaLabel,
  className = "",
  disabled = false,
  onValueChange,
  options,
  placeholder = "Choose an option",
  title,
  value,
  variant = "default",
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: Value) => void;
  options: readonly CustomSelectOption<Value>[];
  placeholder?: string;
  title?: string;
  value: Value;
  variant?: "default" | "embedded" | "compact";
}) {
  const selectId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = options[selectedIndex];

  function findEnabledIndex(start: number, direction: 1 | -1): number {
    if (options.length === 0) return -1;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + offset * direction + options.length) % options.length;
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  function positionMenu(): CSSProperties | null {
    const trigger = triggerRef.current;
    const anchor = variant === "embedded" ? rootRef.current?.parentElement : trigger;
    const rect = anchor?.getBoundingClientRect();
    if (!rect) return null;
    const horizontalInset = 8;
    const maxWidth = Math.max(0, window.innerWidth - horizontalInset * 2);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const rootStyle = getComputedStyle(document.documentElement);
    const optionFontSize = Number.parseFloat(rootStyle.fontSize) * 0.83;
    if (context && Number.isFinite(optionFontSize)) {
      context.font = `${optionFontSize}px ${rootStyle.fontFamily}`;
    }
    const widestLabel = context
      ? options.reduce((widest, option) => Math.max(widest, context.measureText(option.label).width), 0)
      : 0;
    const optionAccessoryWidth = selectedIndex >= 0 ? 36 : 0;
    const contentWidth = widestLabel + 22 + 14 + optionAccessoryWidth;
    const width = Math.min(Math.max(rect.width, 190, contentWidth), maxWidth);
    const left = Math.min(Math.max(horizontalInset, rect.left), window.innerWidth - width - horizontalInset);
    const optionHeight = 38;
    const optionGap = 3;
    const menuPaddingAndBorder = 14;
    const desiredHeight = Math.min(
      320,
      options.length * optionHeight +
        Math.max(0, options.length - 1) * optionGap +
        menuPaddingAndBorder,
    );
    const spaceBelow = window.innerHeight - rect.bottom - horizontalInset;
    const spaceAbove = rect.top - horizontalInset;
    const opensBelow = spaceBelow >= Math.min(desiredHeight, 120) || spaceBelow >= spaceAbove;
    const availableHeight = Math.max(40, opensBelow ? spaceBelow : spaceAbove);
    const maxHeight = Math.min(desiredHeight, availableHeight);
    const top = opensBelow ? rect.bottom + 6 : Math.max(horizontalInset, rect.top - maxHeight - 6);
    return { left, maxHeight, top, width };
  }

  function openMenu(startIndex = selectedIndex) {
    const initialIndex = startIndex >= 0 && !options[startIndex]?.disabled
      ? startIndex
      : findEnabledIndex(0, 1);
    setActiveIndex(initialIndex);
    setMenuStyle(positionMenu());
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setMenuStyle(null);
  }

  function selectOption(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    if (option.value !== value) onValueChange(option.value);
    closeMenu();
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      if (open) {
        setActiveIndex((current) => findEnabledIndex(current + direction, direction));
      } else {
        openMenu();
      }
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const first = findEnabledIndex(0, 1);
      const last = findEnabledIndex(options.length - 1, -1);
      if (!open) openMenu(event.key === "Home" ? first : last);
      else setActiveIndex(event.key === "Home" ? first : last);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openMenu();
      else selectOption(activeIndex);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }

    if (event.key === "Tab" && open) {
      closeMenu();
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      typeaheadRef.current += event.key.toLocaleLowerCase();
      if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current = window.setTimeout(() => {
        typeaheadRef.current = "";
        typeaheadTimerRef.current = null;
      }, 700);
      const start = open ? activeIndex + 1 : selectedIndex + 1;
      for (let offset = 0; offset < options.length; offset += 1) {
        const index = (start + offset) % options.length;
        if (!options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(typeaheadRef.current)) {
          event.preventDefault();
          if (!open) openMenu(index);
          else setActiveIndex(index);
          break;
        }
      }
    }
  }

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) closeMenu();
    };
    const repositionMenu = () => setMenuStyle(positionMenu());

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("scroll", repositionMenu, true);
    window.addEventListener("resize", repositionMenu);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("scroll", repositionMenu, true);
      window.removeEventListener("resize", repositionMenu);
    };
  }, [open, options.length]);

  useEffect(() => () => {
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
  }, []);

  const rootClassName = [
    "custom-select",
    `custom-select--${variant}`,
    className,
  ].filter(Boolean).join(" ");
  const menuId = `${selectId}-listbox`;

  return (
    <div className={rootClassName} ref={rootRef}>
      <button
        aria-activedescendant={open && activeIndex >= 0 ? `${menuId}-option-${activeIndex}` : undefined}
        aria-autocomplete="none"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="custom-select-trigger"
        disabled={disabled || options.length === 0}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        onKeyDown={onTriggerKeyDown}
        ref={triggerRef}
        role="combobox"
        data-tooltip={title}
        type="button"
      >
        <span className="custom-select-value">{selectedOption?.label ?? placeholder}</span>
        <Icon name="expand_more" />
      </button>
      {open && menuStyle && createPortal(
        <div
          aria-label={`${ariaLabel} options`}
          className="custom-select-menu"
          id={menuId}
          ref={menuRef}
          role="listbox"
          style={menuStyle}
        >
          {options.map((option, index) => (
            <div
              aria-disabled={option.disabled || undefined}
              aria-selected={option.value === value}
              className={`custom-select-option${index === activeIndex ? " active" : ""}`}
              id={`${menuId}-option-${index}`}
              key={option.value}
              onClick={() => selectOption(index)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
            >
              <span>{option.label}</span>
              {option.value === value && <Icon name="check" />}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
