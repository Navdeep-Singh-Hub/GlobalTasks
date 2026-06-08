"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "./input";

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
};

type DropdownPos = {
  top: number;
  left: number;
  width: number;
  listMaxHeight: number;
  placement: "bottom" | "top";
};

const GAP = 6;
const MAX_LIST_HEIGHT = 224;
const SEARCH_HEIGHT = 52;

function computeDropdownPosition(trigger: HTMLButtonElement): DropdownPos {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const preferredHeight = SEARCH_HEIGHT + MAX_LIST_HEIGHT;
  const openUp = spaceBelow < preferredHeight && spaceAbove > spaceBelow;
  const available = openUp ? spaceAbove : spaceBelow;
  const listMaxHeight = Math.min(MAX_LIST_HEIGHT, Math.max(96, available - SEARCH_HEIGHT - 8));
  const panelHeight = SEARCH_HEIGHT + listMaxHeight;

  return {
    top: openUp ? rect.top - panelHeight - GAP : rect.bottom + GAP,
    left: rect.left,
    width: rect.width,
    listMaxHeight,
    placement: openUp ? "top" : "bottom",
  };
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    setPos(computeDropdownPosition(triggerRef.current));
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const normalized = query.trim().toLowerCase();
  const filtered = !normalized
    ? options
    : options.filter((o) => {
        const hay = `${o.label} ${o.searchText || ""}`.toLowerCase();
        return hay.includes(normalized);
      });

  const dropdown =
    open && pos && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[200] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-elevated dark:border-zinc-700 dark:bg-zinc-950"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
            }}
            role="listbox"
          >
            <div className="border-b border-zinc-100 p-2 dark:border-zinc-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>
            <ul className="overflow-y-auto py-1" style={{ maxHeight: pos.listMaxHeight }}>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-500">{emptyMessage}</li>
              ) : (
                filtered.map((option) => (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-brand-50 dark:hover:bg-brand-950/30",
                        option.value === value &&
                          "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
                      )}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-left text-sm shadow-sm",
            "focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200",
            "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
            !selected && "text-zinc-400"
          )}
        >
          <span className="truncate">{selected?.label || placeholder}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition", open && "rotate-180")} />
        </button>
      </div>
      {dropdown}
    </>
  );
}
