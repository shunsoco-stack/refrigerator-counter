export const STORAGE_KEY = "refrigerator-counter:v1";

export type ReasonId = "drink" | "food" | "just-because" | "check" | "nothing";

export interface Reason {
  id: ReasonId;
  label: string;
  description: string;
}

export const REASONS: readonly Reason[] = [
  { id: "drink", label: "飲み物", description: "喉がかわいたので。" },
  { id: "food", label: "食べ物", description: "お腹がすいたので。" },
  { id: "just-because", label: "なんとなく", description: "特に理由はありません。" },
  { id: "check", label: "中身の確認", description: "在庫を確かめるために。" },
  { id: "nothing", label: "開けたけど何も取らなかった", description: "見るだけで満足しました。" },
];

export type AchievementId = "checking-pro" | "fridge-guard" | "cold-air-master";

export interface Achievement {
  id: AchievementId;
  title: string;
  threshold: number;
  description: string;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: "checking-pro", title: "確認のプロ", threshold: 10, description: "1日に10回、中身の平和を確認しました。" },
  { id: "fridge-guard", title: "冷蔵庫警備員", threshold: 30, description: "1日に30回。冷蔵庫の安全は、あなたが守っています。" },
  { id: "cold-air-master", title: "冷気の支配者", threshold: 50, description: "1日に50回。扉の向こう側と、もう顔なじみです。" },
];

export interface OpeningRecord {
  id: string;
  openedAt: string;
  reason: ReasonId;
}

export interface UnlockedAchievement {
  id: AchievementId;
  unlockedAt: string;
  dateKey: string;
}

export interface CounterState {
  version: 1;
  records: OpeningRecord[];
  unlockedAchievements: UnlockedAchievement[];
  undoId: string | null;
  selectedReason: ReasonId;
}

export interface WeeklyCount {
  dateKey: string;
  label: string;
  count: number;
  isToday: boolean;
}

export interface CounterStats {
  today: number;
  week: number;
  total: number;
  lastOpenedAt: string | null;
  hourly: number[];
  weekly: WeeklyCount[];
}

const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;
const MESSAGES = ["中身はさっきと同じです", "何か増えていると思いましたか？", "冷気が逃げました"] as const;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createEmptyState(): CounterState {
  return { version: 1, records: [], unlockedAchievements: [], undoId: null, selectedReason: "just-because" };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isReasonId(value: unknown): value is ReasonId {
  return REASONS.some((reason) => reason.id === value);
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && isDateKey(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function isOpeningRecord(value: unknown): value is OpeningRecord {
  return isObject(value) && isNonemptyString(value.id) && isIsoTimestamp(value.openedAt) && isReasonId(value.reason);
}

function isUnlockedAchievement(value: unknown): value is UnlockedAchievement {
  return isObject(value) && ACHIEVEMENTS.some((achievement) => achievement.id === value.id) && isIsoTimestamp(value.unlockedAt) && isDateKey(value.dateKey);
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate);
}

/** This function never writes storage: callers must keep the original data when error is non-null. */
export function parseStoredState(raw: string | null): { state: CounterState; error: string | null } {
  const invalid = (message: string) => ({ state: createEmptyState(), error: `${message} 元のデータは変更していません。` });
  if (raw === null) return { state: createEmptyState(), error: null };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return invalid("保存データを読み込めませんでした。");
  }

  if (!isObject(value)) return invalid("保存データの形式が正しくありません。");
  if (value.version !== 1) return invalid("このバージョンの保存データには対応していません。");
  if (!isArrayOf(value.records, isOpeningRecord) || !isArrayOf(value.unlockedAchievements, isUnlockedAchievement) || !isReasonId(value.selectedReason)) {
    return invalid("保存データに確認できない記録が含まれています。");
  }

  const { records, unlockedAchievements, selectedReason, undoId } = value;
  if (new Set(records.map((record) => record.id)).size !== records.length || new Set(unlockedAchievements.map((achievement) => achievement.id)).size !== unlockedAchievements.length) {
    return invalid("保存データに重複した記録が含まれています。");
  }
  if (undoId !== null && (!isNonemptyString(undoId) || records[records.length - 1]?.id !== undoId)) {
    return invalid("取り消し対象の記録を確認できませんでした。");
  }

  return {
    state: {
      version: 1,
      records: records.map(({ id, openedAt, reason }) => ({ id, openedAt, reason })),
      unlockedAchievements: unlockedAchievements.map(({ id, unlockedAt, dateKey }) => ({ id, unlockedAt, dateKey })),
      undoId,
      selectedReason,
    },
    error: null,
  };
}

function assertValidDate(date: Date): void {
  if (!Number.isFinite(date.getTime())) throw new RangeError("日時が正しくありません。");
}

export function getDateKey(date: Date): string {
  assertValidDate(date);
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfLocalDay(date: Date): number {
  assertValidDate(date);
  const start = new Date(date.getTime());
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/** Calendar dates, not 24-hour offsets, keep local day/week boundaries correct across DST. */
export function getStats(records: OpeningRecord[], now: Date): CounterStats {
  const todayKey = getDateKey(now);
  const monday = new Date(startOfLocalDay(now));
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekly = WEEKDAY_LABELS.map((label, index): WeeklyCount => {
    const date = new Date(monday.getTime());
    date.setDate(monday.getDate() + index);
    const dateKey = getDateKey(date);
    return { dateKey, label, count: 0, isToday: dateKey === todayKey };
  });
  const weekDays = new Map(weekly.map((day) => [day.dateKey, day]));
  const hourly = Array<number>(24).fill(0);
  let today = 0;
  let lastOpenedAt: string | null = null;
  let latestTimestamp = -Infinity;

  for (const record of records) {
    const date = new Date(record.openedAt);
    const timestamp = date.getTime();
    if (!Number.isFinite(timestamp)) continue;
    const dateKey = getDateKey(date);
    if (dateKey === todayKey) {
      today += 1;
      const hour = date.getHours();
      hourly[hour] = (hourly[hour] ?? 0) + 1;
    }
    const weekDay = weekDays.get(dateKey);
    if (weekDay) weekDay.count += 1;
    if (timestamp > latestTimestamp) {
      latestTimestamp = timestamp;
      lastOpenedAt = record.openedAt;
    }
  }

  return { today, week: weekly.reduce((sum, day) => sum + day.count, 0), total: records.length, lastOpenedAt, hourly, weekly };
}

export function addOpening(state: CounterState, now: Date, id: string): { state: CounterState; unlocked: Achievement[] } {
  assertValidDate(now);
  // A repeated event ID must not create a second opening.
  if (!isNonemptyString(id) || state.records.some((record) => record.id === id)) return { state, unlocked: [] };

  const openedAt = now.toISOString();
  const records = [...state.records, { id, openedAt, reason: state.selectedReason }];
  const todayCount = getStats(records, now).today;
  const unlockedIds = new Set(state.unlockedAchievements.map((achievement) => achievement.id));
  const unlocked = ACHIEVEMENTS.filter((achievement) => todayCount >= achievement.threshold && !unlockedIds.has(achievement.id));

  return {
    state: {
      ...state,
      records,
      undoId: id,
      unlockedAchievements: [...state.unlockedAchievements, ...unlocked.map((achievement) => ({ id: achievement.id, unlockedAt: openedAt, dateKey: getDateKey(now) }))],
    },
    unlocked,
  };
}

export function undoOpening(state: CounterState): CounterState {
  if (state.undoId === null) return state;
  const lastRecord = state.records[state.records.length - 1];
  if (lastRecord?.id !== state.undoId) return { ...state, undoId: null };
  return { ...state, records: state.records.slice(0, -1), undoId: null };
}

export function selectReason(state: CounterState, reason: ReasonId): CounterState {
  return isReasonId(reason) && state.selectedReason !== reason ? { ...state, selectedReason: reason } : state;
}

export function formatElapsed(lastOpenedAt: string | null, now: Date): string {
  if (lastOpenedAt === null) return "—";
  const milliseconds = now.getTime() - Date.parse(lastOpenedAt);
  if (!Number.isFinite(milliseconds)) return "—";
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3_600) {
    const remainder = seconds % 60;
    return `${Math.floor(seconds / 60)}分${remainder ? ` ${remainder}秒` : ""}`;
  }
  if (seconds < 86_400) {
    const remainder = Math.floor((seconds % 3_600) / 60);
    return `${Math.floor(seconds / 3_600)}時間${remainder ? ` ${remainder}分` : ""}`;
  }
  const remainder = Math.floor((seconds % 86_400) / 3_600);
  return `${Math.floor(seconds / 86_400)}日${remainder ? ` ${remainder}時間` : ""}`;
}

function escapeCsvCell(value: string): string {
  // Keep user-edited storage values from becoming spreadsheet formulas.
  const safeValue = /^(?:\s*[-=+@]|[\t\r\n])/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
}

export function toCsv(records: OpeningRecord[]): string {
  const rows = [["記録ID", "日時（ISO 8601）", "日付（ローカル）", "時刻（ローカル）", "理由"]];
  const sortedRecords = [...records].sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  for (const record of sortedRecords) {
    const date = new Date(record.openedAt);
    const localTime = [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
    rows.push([record.id, date.toISOString(), getDateKey(date), localTime, REASONS.find((reason) => reason.id === record.reason)?.label ?? record.reason]);
  }
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

export function getMessage(totalCount: number): string {
  const count = Number.isFinite(totalCount) ? Math.max(1, Math.floor(totalCount)) : 1;
  return MESSAGES[(count - 1) % MESSAGES.length] ?? MESSAGES[0];
}
