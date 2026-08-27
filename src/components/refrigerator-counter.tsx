"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACHIEVEMENTS, REASONS, addOpening, formatElapsed, getDateKey, getMessage,
  getStats, selectReason, startOfLocalDay, toCsv, undoOpening, type ReasonId,
} from "@/lib/counter";
import { commitState, useClock, useCounterStore } from "@/lib/storage";
import { trackAction } from "@/lib/telemetry";
import { GITHUB_URL, SITE_URL } from "@/lib/site";
import { Icon } from "./icon";
import { ThemeControl } from "./theme-control";
import { FridgeIllustration } from "./fridge-illustration";
import { ActivityChart } from "./activity-chart";
import { Dialog } from "./dialog";

type Achievement = (typeof ACHIEVEMENTS)[number];
type Notice = { text: string; error?: boolean };
const reasonIcons: Record<ReasonId, string> = {
  drink: "drink", food: "food", "just-because": "sparkles", check: "eye", nothing: "empty",
};
const achievementIcons = ["eye", "shield", "crown"];
const numberFormat = new Intl.NumberFormat("ja-JP");
const dateFormat = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" });
const timeFormat = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function RefrigeratorCounter() {
  const { state, hydrated, error } = useCounterStore();
  const clock = useClock();
  const currentDay = clock ? startOfLocalDay(new Date(clock)) : 0;
  const stats = useMemo(() => getStats(state.records, new Date(currentDay)), [state.records, currentDay]);
  const recent = useMemo(() => [...state.records].sort((a, b) => b.openedAt.localeCompare(a.openedAt)).slice(0, 3), [state.records]);
  const [pulse, setPulse] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<"reasons" | "about" | "share" | null>(null);
  const [achievement, setAchievement] = useState<Achievement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [shareText, setShareText] = useState("");
  const [sharing, setSharing] = useState(false);
  const reason = REASONS.find((item) => item.id === state.selectedReason) ?? REASONS[2];
  const unlockedIds = new Set(state.unlockedAchievements.map((item) => item.id));
  const nextAchievement = ACHIEVEMENTS.find((item) => !unlockedIds.has(item.id));
  const ready = hydrated && clock > 0 && !error;
  const lastTime = stats.lastOpenedAt ? timeFormat.format(new Date(stats.lastOpenedAt)) : "—";
  const lastIsToday = stats.lastOpenedAt && getDateKey(new Date(stats.lastOpenedAt)) === getDateKey(new Date(currentDay));

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.error ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function openFridge() {
    let newlyUnlocked: Achievement[] = [];
    const openedAt = new Date();
    const id = crypto.randomUUID();
    const result = await commitState((current) => {
      const change = addOpening(current, openedAt, id);
      newlyUnlocked = change.unlocked;
      return change.state;
    });
    if (!result.ok) { setNotice({ text: result.error, error: true }); return; }
    setPulse((value) => value + 1);
    setMessage(getMessage(result.state.records.length));
    trackAction("fridge_opened", { reason: result.state.selectedReason });
    newlyUnlocked.forEach((item) => trackAction("achievement_unlocked", { threshold: item.threshold }));
    if (newlyUnlocked[0]) setAchievement(newlyUnlocked[0]);
  }

  async function undo() {
    let changed = false;
    const result = await commitState((current) => {
      changed = current.undoId !== null;
      return undoOpening(current);
    });
    if (!result.ok) { setNotice({ text: result.error, error: true }); return; }
    if (!changed) return;
    setMessage("今の1回は、なかったことに。");
    setNotice({ text: "直前の1回を取り消しました。" });
    trackAction("opening_undone");
  }

  async function chooseReason(id: ReasonId) {
    const result = await commitState((current) => selectReason(current, id));
    if (!result.ok) { setNotice({ text: result.error, error: true }); return; }
    setModal(null);
    trackAction("reason_selected", { reason: id });
  }

  function exportCsv() {
    const blob = new Blob([toCsv(state.records)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `refrigerator-counter-${getDateKey(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ text: `${state.records.length}件の記録をCSVに書き出しました。` });
    trackAction("csv_exported", { recordCount: state.records.length });
  }

  async function share() {
    const text = `冷蔵庫を、今日${stats.today}回開けました。\n今週${stats.week}回 / 累計${stats.total}回\n${stats.today > 0 ? getMessage(stats.today) : "今日はまだ、冷気を守っています。"}\n#冷蔵庫カウンター`;
    const fullText = `${text}\n${SITE_URL}`;
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: "冷蔵庫カウンター", text, url: SITE_URL });
        trackAction("result_shared", { method: "native" });
        setNotice({ text: "今日の成果を共有しました。" });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullText);
        trackAction("result_shared", { method: "clipboard" });
        setNotice({ text: "結果とURLをコピーしました。" });
      } else {
        setShareText(fullText);
        setModal("share");
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setShareText(fullText);
        setModal("share");
      }
    } finally { setSharing(false); }
  }

  return (
    <div className="app-shell" data-ready={ready ? "true" : "false"}>
      <a href="#counter" className="skip-link">カウンターへ移動</a>
      <header className="app-header">
        <div className="brand"><span className="brand-icon"><Icon name="fridge" size={23} /></span><span>冷蔵庫カウンター<small>REFRIGERATOR COUNTER</small></span></div>
        <ThemeControl />
      </header>

      <main>
        <div className="intro">
          <div><p className="eyebrow">A VERY SERIOUS FRIDGE TRACKER</p><h1>開けた回数だけ、<span>真剣に。</span></h1><p className="intro-description">役に立ちそうで、ほとんど役に立たない。</p></div>
          <div className="today-pill"><Icon name="calendar" size={16} /><span>{clock ? dateFormat.format(new Date(clock)) : "今日の記録"}</span></div>
        </div>

        {error ? <div className="storage-warning" role="alert"><Icon name="info" size={20} /><div><strong>記録を安全に保存できません</strong><p>{error} 既存データは変更していません。</p></div></div> : null}

        <div className="dashboard-grid">
          <div className="counter-column">
            <section className="surface counter-card" id="counter" aria-labelledby="counter-title">
              <div className="counter-topline"><span className="section-label"><span className="status-dot" />冷蔵庫、見守り中</span><span className="tiny-label">TODAY&apos;S COUNT</span></div>
              <div className="count-stage">
                <div className="count-copy"><h2 id="counter-title">今日の開閉回数</h2><p className="big-count" aria-live="polite" aria-atomic="true"><span data-testid="today-count">{numberFormat.format(stats.today)}</span><span className="count-unit">回</span></p><p className="count-note">{stats.today === 0 ? "まだ冷気は守られています。" : "その1回、ちゃんと覚えています。"}</p></div>
                <FridgeIllustration pulse={pulse} />
              </div>
              <div className="fridge-message" role="status" aria-live="polite"><Icon name="snow" size={16} /><p>{message ?? (stats.total > 0 ? getMessage(stats.total) : "いつもの場所で、お待ちしています。")}</p></div>
              <button className="open-button" type="button" onClick={openFridge} disabled={!ready}><span className="button-plus">＋</span><span>冷蔵庫を開けた</span><span className="button-increment">1回を記録</span></button>
              <button className="reason-trigger" type="button" onClick={() => setModal("reasons")} disabled={!ready} aria-haspopup="dialog"><span className="reason-trigger-label">開けた理由</span><span className="selected-reason"><Icon name={reasonIcons[reason.id]} size={18} />{reason.label}<Icon className="reason-chevron" name="chevron" size={15} /></span></button>
              <div className="undo-row"><button className="text-button undo-button" type="button" onClick={undo} disabled={!ready || !state.undoId}><Icon name="undo" size={15} />直前の1回を戻す</button><span>間違えても、大丈夫。</span></div>
              <div className="time-strip">
                <div><span><Icon name="clock" size={14} />最終開閉時刻</span><strong data-testid="last-opened">{lastTime}</strong><small>{stats.lastOpenedAt ? lastIsToday ? "今日" : dateFormat.format(new Date(stats.lastOpenedAt)) : "まだ開けていません"}</small></div>
                <div><span><Icon name="snow" size={14} />前回からの経過時間</span><strong className="elapsed" data-testid="elapsed-time">{clock ? formatElapsed(stats.lastOpenedAt, new Date(clock)) : "—"}</strong><small>{stats.lastOpenedAt ? "冷気、回復中。" : "はじめの1回を待っています"}</small></div>
              </div>
            </section>

            <div className="summary-grid">
              <section className="surface summary-card"><div className="summary-icon"><Icon name="calendar" size={20} /></div><div><h2>今週の開閉</h2><p><strong data-testid="week-count">{numberFormat.format(stats.week)}</strong><span>回</span></p></div><span className="summary-note">月〜日</span></section>
              <section className="surface summary-card"><div className="summary-icon"><Icon name="fridge" size={20} /></div><div><h2>累計の開閉</h2><p><strong data-testid="total-count">{numberFormat.format(stats.total)}</strong><span>回</span></p></div><span className="summary-note">これまで</span></section>
            </div>
          </div>

          <div className="insights-column">
            <ActivityChart stats={stats} />
            <section className="surface achievements-card" aria-labelledby="achievements-title">
              <div className="section-heading"><div className="section-label"><Icon name="trophy" size={19} /><h2 id="achievements-title">ちいさな実績</h2></div><span className="achievement-total">{unlockedIds.size}<span> / {ACHIEVEMENTS.length}</span></span></div>
              <div className="achievement-list">
                {ACHIEVEMENTS.map((item, index) => {
                  const unlocked = unlockedIds.has(item.id);
                  return <div className={`achievement-item ${unlocked ? "unlocked" : ""}`} key={item.id}><span className="achievement-badge"><Icon name={achievementIcons[index]} size={26} />{unlocked ? <span className="badge-check"><Icon name="check" size={9} /></span> : null}</span><strong>{item.title}</strong><span>1日 {item.threshold} 回</span><small>{unlocked ? "解除済み" : <><Icon name="lock" size={9} />未解除</>}</small></div>;
                })}
              </div>
              {nextAchievement ? <div className="achievement-progress"><div><span>次は「{nextAchievement.title}」</span><strong>あと{Math.max(0, nextAchievement.threshold - stats.today)}回</strong></div><progress max={nextAchievement.threshold} value={Math.min(stats.today, nextAchievement.threshold)} aria-label={`次の実績まで、今日${stats.today}回、目標${nextAchievement.threshold}回`} /></div> : <p className="all-achievements">すべての実績を解除。冷蔵庫も、あなたを覚えました。</p>}
              <p className="achievement-disclaimer">※ 賞品はありません。冷気は大切に。</p>
            </section>

            <section className="surface recent-card" aria-labelledby="recent-title"><div className="section-heading"><div className="section-label"><Icon name="clock" size={18} /><h2 id="recent-title">直近の開閉</h2></div><span className="tiny-label">RECENT</span></div>
              {recent.length === 0 ? <p className="recent-empty">何もなかった記録も、ここに残ります。</p> : <ul className="recent-list">{recent.map((item) => {
                const itemReason = REASONS.find((entry) => entry.id === item.reason) ?? REASONS[2];
                return <li key={item.id}><span className="recent-reason"><span><Icon name={reasonIcons[item.reason]} size={15} /></span>{itemReason.label}</span><time dateTime={item.openedAt}>{getDateKey(new Date(item.openedAt)) === getDateKey(new Date(currentDay)) ? "" : `${new Date(item.openedAt).getMonth() + 1}/${new Date(item.openedAt).getDate()} `}{timeFormat.format(new Date(item.openedAt)).slice(0, 5)}</time></li>;
              })}</ul>}
            </section>
          </div>
        </div>

        <div className="bottom-bar"><p><Icon name="lock" size={14} />記録は、このブラウザの中だけに。</p><div className="export-actions"><button className="secondary-button" type="button" onClick={exportCsv} disabled={!hydrated || stats.total === 0}><Icon name="download" size={16} />CSVを書き出す</button><button className="secondary-button share-button" type="button" onClick={share} disabled={!hydrated || sharing}><Icon name="share" size={16} />{sharing ? "共有中…" : "結果を共有"}</button></div></div>
      </main>

      <footer className="app-footer"><span>冷蔵庫は、何も変わっていないかもしれない。</span><div><button type="button" onClick={() => setModal("about")}>このアプリについて</button><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a></div></footer>

      <Dialog open={modal === "reasons"} onClose={() => setModal(null)} title="開けた理由">
        <p className="dialog-lead">今日は、何を探してた？</p><div className="reason-options" role="group" aria-label="理由の一覧">{REASONS.map((item) => <button type="button" className={`reason-option ${state.selectedReason === item.id ? "selected" : ""}`} key={item.id} aria-label={item.label} aria-pressed={state.selectedReason === item.id} aria-describedby={`reason-${item.id}-description`} onClick={() => chooseReason(item.id)}><span className="reason-option-icon"><Icon name={reasonIcons[item.id]} size={23} /></span><span className="reason-option-copy"><strong>{item.label}</strong><small id={`reason-${item.id}-description`}>{item.description}</small></span><span className="radio-indicator">{state.selectedReason === item.id ? <Icon name="check" size={13} /> : null}</span></button>)}</div><p className="dialog-footnote">選んだ理由で、次の1回を記録します。</p>
      </Dialog>

      <Dialog open={achievement !== null} onClose={() => setAchievement(null)} title="実績解除" className="achievement-dialog">
        {achievement ? <div className="celebration"><div className="celebration-badge"><Icon name="trophy" size={48} /><span className="celebration-spark left">✦</span><span className="celebration-spark right">✦</span></div><p className="eyebrow">ACHIEVEMENT UNLOCKED</p><h3>{achievement.title}</h3><p className="celebration-threshold">1日{achievement.threshold}回の開閉を達成</p><p className="celebration-description">{achievement.description}</p><button className="open-button" type="button" onClick={() => setAchievement(null)}>引き続き、見守る<Icon name="arrow" size={18} /></button><p className="dialog-footnote">名誉と引き換えに、少しの冷気を失いました。</p></div> : null}
      </Dialog>

      <Dialog open={modal === "about"} onClose={() => setModal(null)} title="このアプリについて">
        <div className="about-copy"><p>冷蔵庫を開けた回数だけを、真剣に記録します。食材の管理も、献立の提案もしません。</p><h3>記録とプライバシー</h3><p>全履歴・実績は、この端末のブラウザのlocalStorageに保存されます。アカウントも同期もありません。ブラウザのデータ削除で失われるため、必要ならCSVを書き出してください。</p><p>改善のため、Vercel Analyticsでアクセスを計測し、主要操作の匿名イベントを送信します。操作イベントの集計はVercelの対応プランで利用できます。履歴一覧・記録ID・正確な開閉時刻は送信しません。</p><h3>ホーム画面に、冷蔵庫を。</h3><p>対応ブラウザの「アプリをインストール」、または共有メニューの「ホーム画面に追加」から設置できます。最初にオンラインで開いた後は、オフラインでも記録できます。</p><h3>集計のルール</h3><p>端末の時刻を使い、今日＝0:00〜24:00、今週＝月曜〜日曜。Undoは直前の1件だけ、実績は一度解除したらそのままです。理由の変更は次の記録に適用されます。</p></div>
      </Dialog>

      <Dialog open={modal === "share"} onClose={() => setModal(null)} title="結果を共有"><p className="dialog-lead">共有機能を利用できないため、下の文章を選択してコピーしてください。</p><textarea className="share-text" value={shareText} readOnly aria-label="共有用の文章" onFocus={(event) => event.target.select()} rows={8} /><p className="dialog-footnote">個別の開閉履歴は共有されません。</p></Dialog>
      <div className="toast-area" aria-live="polite" aria-atomic="true">{notice ? <div className={`toast ${notice.error ? "error" : ""}`}><Icon name={notice.error ? "info" : "check"} size={18} /><span>{notice.text}</span><button type="button" aria-label="通知を閉じる" onClick={() => setNotice(null)}><Icon name="close" size={15} /></button></div> : null}</div>
    </div>
  );
}
