"use client";

import { useState, useRef, useEffect, useId } from "react";

interface ComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  id?: string;
}

export default function ComboboxInput({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  id,
}: ComboboxInputProps) {
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
    : options;

  const showNew =
    value.trim() !== "" &&
    !options.some((o) => o.toLowerCase() === value.toLowerCase());

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    const totalItems = filtered.length + (showNew ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        onChange(filtered[highlightIndex]);
        setOpen(false);
      } else if (showNew && highlightIndex === filtered.length) {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlightIndex(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && (filtered.length > 0 || showNew)}
        aria-controls={listId}
        aria-activedescendant={highlightIndex >= 0 ? `${listId}-${highlightIndex}` : undefined}
        placeholder={placeholder}
        className={className}
      />
      {open && (filtered.length > 0 || showNew) && (
        <ul id={listId} role="listbox" className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {filtered.map((option, i) => (
            <li
              key={option}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlightIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                i === highlightIndex
                  ? "bg-zinc-100 dark:bg-zinc-800"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {option}
            </li>
          ))}
          {showNew && (
            <li
              id={`${listId}-${filtered.length}`}
              role="option"
              aria-selected={highlightIndex === filtered.length}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
              onMouseEnter={() => setHighlightIndex(filtered.length)}
              className={`cursor-pointer border-t border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700 ${
                highlightIndex === filtered.length
                  ? "bg-zinc-100 dark:bg-zinc-800"
                  : "text-zinc-500 dark:text-zinc-400"
              }`}
            >
              Create &ldquo;{value.trim()}&rdquo;
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
