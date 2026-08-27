"use client";

import { useState } from "react";
import { getStats } from "@/lib/counter";
import { trackAction } from "@/lib/telemetry";
import { Icon } from "./icon";

type Stats = ReturnType<typeof getStats>;
export function ActivityChart({ stats }: { stats: Stats }) {
  const [view, setView] = useState<"hourly" | "weekly">("hourly");
  const bars = view === "hourly"
    ? stats.hourly.map((count, hour) => ({ label: `${hour}`, count, highlight: count > 0 }))
    : stats.weekly.map((day) => ({ label: day.label, count: day.count, highlight: day.isToday }));
  const max = Math.max(4, ...bars.map((bar) => bar.count));
  const total = view === "hourly" ? stats.today : stats.week;
  const peak = bars.reduce((best, bar) => bar.count > best.count ? bar : best, bars[0]);
  const peakText = view === "hourly" ? `${peak.label}時台` : `${peak.label}曜日`;
  return (
    <section className="surface chart-card" aria-labelledby="activity-title">
      <div className="section-heading"><div className="section-label"><Icon name="chart" size={19} /><h2 id="activity-title">開閉のリズム</h2></div><span className="tiny-label">ACTIVITY</span></div>
      <div className="chart-toolbar">
        <div><strong className="chart-total">{total}<span>回</span></strong><p className="muted text-xs">{view === "hourly" ? "今日の開閉回数" : "今週の開閉回数（月曜始まり）"}</p></div>
        <div className="segmented" role="group" aria-label="グラフの表示">
          <button type="button" aria-pressed={view === "hourly"} aria-controls="activity-plot" onClick={() => { setView("hourly"); trackAction("chart_viewed", { view: "hourly" }); }}>時間帯</button>
          <button type="button" aria-pressed={view === "weekly"} aria-controls="activity-plot" onClick={() => { setView("weekly"); trackAction("chart_viewed", { view: "weekly" }); }}>週間</button>
        </div>
      </div>
      <div id="activity-plot" className={`chart-plot ${view}`} data-testid={`${view}-chart`} role="img" aria-label={`${view === "hourly" ? "今日の時間帯別" : "今週の曜日別"}開閉回数。${bars.map((bar) => `${bar.label}${view === "hourly" ? "時" : "曜日"} ${bar.count}回`).join("、")}`}>
        <div className="chart-grid" aria-hidden="true"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div>
        <div className="chart-bars" aria-hidden="true">
          {bars.map((bar, index) => <div className="chart-column" key={bar.label} title={`${bar.label}${view === "hourly" ? "時" : "曜日"}: ${bar.count}回`}>
            <div className="bar-track"><div className={`bar ${bar.highlight ? "highlight" : ""} ${bar.count === 0 ? "zero" : ""}`} style={{ height: `${Math.max(1.5, (bar.count / max) * 100)}%` }}>{view === "weekly" && bar.count > 0 ? <span className="bar-value">{bar.count}</span> : null}</div></div>
            <span className={`bar-label ${bar.highlight && view === "weekly" ? "current" : ""}`}>{view === "weekly" || [0, 6, 12, 18, 23].includes(index) ? bar.label : ""}</span>
          </div>)}
        </div>
        {total === 0 ? <p className="chart-empty">まだ、静かな冷蔵庫です。</p> : null}
      </div>
      <p className="chart-caption"><span className="status-dot" />{total === 0 ? "最初の1回から、リズムが見えてきます。" : `いちばん開けたのは、${peakText}。`}</p>
    </section>
  );
}
