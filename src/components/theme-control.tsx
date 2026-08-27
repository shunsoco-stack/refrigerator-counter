"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { Icon } from "./icon";
import { trackAction } from "@/lib/telemetry";

const THEME_KEY = "refrigerator-counter:theme";
const THEME_EVENT = "refrigerator-counter:theme-change";
type Theme = "system" | "light" | "dark";
const themes: { value: Theme; label: string; icon: string }[] = [
  { value: "system", label: "システム", icon: "monitor" },
  { value: "light", label: "ライト", icon: "sun" },
  { value: "dark", label: "ダーク", icon: "moon" },
];
function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}
function subscribe(listener: () => void) {
  window.addEventListener(THEME_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(THEME_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute("content", dark ? "#111b22" : "#f3f6f7"));
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  useLayoutEffect(() => {
    applyTheme(theme);
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (theme === "system") applyTheme(theme); };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  function choose(value: Theme) {
    try { localStorage.setItem(THEME_KEY, value); } catch { /* Visual switching still works without storage. */ }
    applyTheme(value);
    window.dispatchEvent(new Event(THEME_EVENT));
    trackAction("theme_changed", { theme: value });
  }
  return (
    <div className="theme-control" role="group" aria-label="表示テーマ">
      {themes.map((item) => <button key={item.value} type="button" onClick={() => choose(item.value)} aria-pressed={theme === item.value} aria-label={`${item.label}モード`} title={`${item.label}モード`}><Icon name={item.icon} size={17} /></button>)}
    </div>
  );
}
