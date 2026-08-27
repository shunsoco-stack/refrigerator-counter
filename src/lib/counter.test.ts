import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  REASONS,
  STORAGE_KEY,
  addOpening,
  createEmptyState,
  formatElapsed,
  getDateKey,
  getMessage,
  getStats,
  parseStoredState,
  selectReason,
  startOfLocalDay,
  toCsv,
  undoOpening,
  type CounterState,
  type OpeningRecord,
  type ReasonId,
} from "./counter";

// Local constructors make calendar tests independent of the machine's time zone.
function localDate(year: number, month: number, day: number, hour = 12, minute = 0, second = 0): Date {
  return new Date(year, month - 1, day, hour, minute, second);
}

function record(id: string, date: Date, reason: ReasonId = "just-because"): OpeningRecord {
  return { id, openedAt: date.toISOString(), reason };
}

function recordsOnDay(count: number, date = localDate(2026, 8, 27)): OpeningRecord[] {
  return Array.from({ length: count }, (_, index) => record(`record-${index + 1}`, new Date(date.getTime() - (count - index) * 1_000)));
}

function stateWithRecords(records: OpeningRecord[]): CounterState {
  return { ...createEmptyState(), records, undoId: records[records.length - 1]?.id ?? null };
}

describe("initial state and catalogues", () => {
  it("uses a versioned storage key and a useful default reason", () => {
    expect(STORAGE_KEY).toBe("refrigerator-counter:v1");
    expect(createEmptyState()).toEqual({ version: 1, records: [], unlockedAchievements: [], undoId: null, selectedReason: "just-because" });
  });

  it("creates independent collections on every call", () => {
    const first = createEmptyState();
    first.records.push(record("one", localDate(2026, 8, 27)));
    expect(createEmptyState().records).toEqual([]);
  });

  it("contains all five requested reasons and all three daily thresholds", () => {
    expect(REASONS.map((reason) => reason.label)).toEqual(["飲み物", "食べ物", "なんとなく", "中身の確認", "開けたけど何も取らなかった"]);
    expect(ACHIEVEMENTS.map((achievement) => achievement.threshold)).toEqual([10, 30, 50]);
    expect(ACHIEVEMENTS.map((achievement) => achievement.title)).toContain("確認のプロ");
    expect(ACHIEVEMENTS.map((achievement) => achievement.title)).toContain("冷蔵庫警備員");
  });
});

describe("parseStoredState", () => {
  it("treats missing storage as a new state without an error", () => {
    expect(parseStoredState(null)).toEqual({ state: createEmptyState(), error: null });
  });

  it("round-trips all persisted fields, including achievements and undo", () => {
    const before = selectReason(stateWithRecords(recordsOnDay(9)), "drink");
    const { state } = addOpening(before, localDate(2026, 8, 27), "tenth");
    expect(parseStoredState(JSON.stringify(state))).toEqual({ state, error: null });
  });

  it("accepts an ISO timestamp with an explicit offset", () => {
    const state = stateWithRecords([{ id: "offset", openedAt: "2026-08-27T12:00:00+09:00", reason: "drink" }]);
    expect(parseStoredState(JSON.stringify(state))).toEqual({ state, error: null });
  });

  it.each(["", "{broken", "null", "[]", '"text"'])('reports corrupted data without throwing: %s', (raw) => {
    const result = parseStoredState(raw);
    expect(result.state).toEqual(createEmptyState());
    expect(result.error).toContain("元のデータは変更していません");
  });

  it.each([0, 2, "1", null])("rejects an unsupported schema version: %s", (version) => {
    const result = parseStoredState(JSON.stringify({ ...createEmptyState(), version }));
    expect(result.error).toContain("対応していません");
    expect(result.state.records).toEqual([]);
  });

  it.each([
    ["unknown reason", { id: "one", openedAt: "2026-08-27T03:00:00.000Z", reason: "coffee" }],
    ["invalid timestamp", { id: "one", openedAt: "yesterday", reason: "drink" }],
    ["impossible calendar date", { id: "one", openedAt: "2026-02-30T03:00:00.000Z", reason: "drink" }],
    ["empty ID", { id: " ", openedAt: "2026-08-27T03:00:00.000Z", reason: "drink" }],
    ["missing record", null],
  ])("rejects an entire payload with an invalid record: %s", (_, invalidRecord) => {
    const state = { ...createEmptyState(), records: [record("good", localDate(2026, 8, 27)), invalidRecord] };
    const result = parseStoredState(JSON.stringify(state));
    expect(result.error).not.toBeNull();
    expect(result.state.records).toEqual([]);
  });

  it("rejects duplicate record IDs", () => {
    const entry = record("duplicate", localDate(2026, 8, 27));
    expect(parseStoredState(JSON.stringify(stateWithRecords([entry, entry]))).error).toContain("重複");
  });

  it("rejects a missing collection or an invalid selected reason", () => {
    expect(parseStoredState(JSON.stringify({ ...createEmptyState(), records: null })).error).not.toBeNull();
    expect(parseStoredState(JSON.stringify({ ...createEmptyState(), selectedReason: "unknown" })).error).not.toBeNull();
  });

  it("rejects stale, missing or non-latest undo targets", () => {
    const state = stateWithRecords(recordsOnDay(2));
    for (const undoId of ["missing", "record-1", undefined, 42]) {
      expect(parseStoredState(JSON.stringify({ ...state, undoId })).error).not.toBeNull();
    }
  });

  it.each([
    { id: "unknown", unlockedAt: "2026-08-27T03:00:00.000Z", dateKey: "2026-08-27" },
    { id: "checking-pro", unlockedAt: "invalid", dateKey: "2026-08-27" },
    { id: "checking-pro", unlockedAt: "2026-08-27T03:00:00.000Z", dateKey: "2026-02-30" },
  ])("rejects an invalid achievement: %j", (achievement) => {
    expect(parseStoredState(JSON.stringify({ ...createEmptyState(), unlockedAchievements: [achievement] })).error).not.toBeNull();
  });

  it("rejects duplicate achievement unlocks", () => {
    const achievement = { id: "checking-pro", unlockedAt: "2026-08-27T03:00:00.000Z", dateKey: "2026-08-27" };
    expect(parseStoredState(JSON.stringify({ ...createEmptyState(), unlockedAchievements: [achievement, achievement] })).error).toContain("重複");
  });

  it("discards unrecognised extra fields rather than spreading untrusted objects", () => {
    const result = parseStoredState(JSON.stringify({ ...createEmptyState(), extra: "not part of the schema" }));
    expect(result).toEqual({ state: createEmptyState(), error: null });
  });
});

describe("recording and achievements", () => {
  it("immutably appends the selected reason, timestamp and undo target", () => {
    const original = createEmptyState();
    const selected = selectReason(original, "food");
    const now = localDate(2026, 8, 27, 14, 5, 6);
    const result = addOpening(selected, now, "first");
    expect(result.state.records).toEqual([record("first", now, "food")]);
    expect(result.state.undoId).toBe("first");
    expect(result.unlocked).toEqual([]);
    expect(original).toEqual(createEmptyState());
    expect(selected.records).toEqual([]);
  });

  it("does not add the same event ID twice or accept an empty ID", () => {
    const now = localDate(2026, 8, 27);
    const first = addOpening(createEmptyState(), now, "same").state;
    expect(addOpening(first, now, "same")).toEqual({ state: first, unlocked: [] });
    expect(addOpening(first, now, " ")).toEqual({ state: first, unlocked: [] });
  });

  it.each(ACHIEVEMENTS)("unlocks $title at its daily threshold of $threshold", (achievement) => {
    const now = localDate(2026, 8, 27);
    const before = stateWithRecords(recordsOnDay(achievement.threshold - 1, now));
    before.unlockedAchievements = ACHIEVEMENTS.filter((item) => item.threshold < achievement.threshold).map((item) => ({ id: item.id, unlockedAt: now.toISOString(), dateKey: getDateKey(now) }));
    const result = addOpening(before, now, "threshold");
    expect(result.unlocked).toEqual([achievement]);
    expect(result.state.unlockedAchievements).toContainEqual({ id: achievement.id, unlockedAt: now.toISOString(), dateKey: "2026-08-27" });
  });

  it("does not unlock a badge before 10 openings", () => {
    expect(addOpening(stateWithRecords(recordsOnDay(8)), localDate(2026, 8, 27), "ninth").unlocked).toEqual([]);
  });

  it("uses today's count, not the cumulative count, for achievements", () => {
    const state = stateWithRecords(recordsOnDay(49, localDate(2026, 8, 26)));
    const result = addOpening(state, localDate(2026, 8, 27), "today");
    expect(result.unlocked).toEqual([]);
    expect(getStats(result.state.records, localDate(2026, 8, 27))).toMatchObject({ today: 1, total: 50 });
  });

  it("can award every eligible missing badge without duplicating existing unlocks", () => {
    const result = addOpening(stateWithRecords(recordsOnDay(49)), localDate(2026, 8, 27), "fiftieth");
    expect(result.unlocked).toEqual(ACHIEVEMENTS);
    expect(addOpening(result.state, localDate(2026, 8, 27, 12, 1), "again").unlocked).toEqual([]);
  });

  it("does not unlock an earned badge again on a later day", () => {
    const previous = addOpening(stateWithRecords(recordsOnDay(9, localDate(2026, 8, 26))), localDate(2026, 8, 26), "yesterday-tenth").state;
    const nextDay = { ...previous, records: [...previous.records, ...recordsOnDay(9).map((entry) => ({ ...entry, id: `today-${entry.id}` }))] };
    expect(addOpening(nextDay, localDate(2026, 8, 27), "today-tenth").unlocked).toEqual([]);
  });

  it("rejects an invalid current date", () => {
    expect(() => addOpening(createEmptyState(), new Date("invalid"), "one")).toThrow(RangeError);
  });
});

describe("single-level undo and reason selection", () => {
  it("removes only the latest addition and cannot remove a second record", () => {
    const first = addOpening(createEmptyState(), localDate(2026, 8, 27, 9), "first").state;
    const second = addOpening(first, localDate(2026, 8, 27, 10), "second").state;
    const undone = undoOpening(second);
    expect(undone.records).toEqual(first.records);
    expect(undone.undoId).toBeNull();
    expect(undoOpening(undone)).toBe(undone);
    expect(second.records).toHaveLength(2);
    expect(getStats(undone.records, localDate(2026, 8, 27, 11)).lastOpenedAt).toBe(first.records[0]?.openedAt);
  });

  it("returns to the empty display when the only record is undone", () => {
    const state = addOpening(createEmptyState(), localDate(2026, 8, 27), "first").state;
    expect(getStats(undoOpening(state).records, localDate(2026, 8, 27))).toMatchObject({ today: 0, week: 0, total: 0, lastOpenedAt: null });
  });

  it("keeps earned achievements and does not re-award them after undo", () => {
    const tenth = addOpening(stateWithRecords(recordsOnDay(9)), localDate(2026, 8, 27), "tenth").state;
    const undone = undoOpening(tenth);
    expect(undone.records).toHaveLength(9);
    expect(undone.unlockedAchievements).toEqual(tenth.unlockedAchievements);
    expect(addOpening(undone, localDate(2026, 8, 27), "replacement").unlocked).toEqual([]);
  });

  it("permits one undo again after a new opening", () => {
    const first = addOpening(createEmptyState(), localDate(2026, 8, 27), "first").state;
    const replacement = addOpening(undoOpening(first), localDate(2026, 8, 27), "replacement").state;
    expect(replacement.undoId).toBe("replacement");
    expect(undoOpening(replacement).records).toEqual([]);
  });

  it("does not delete an older record when an undo target is stale", () => {
    const state = { ...stateWithRecords(recordsOnDay(2)), undoId: "record-1" };
    expect(undoOpening(state)).toEqual({ ...state, undoId: null });
  });

  it("keeps the undo target when selecting another reason", () => {
    const state = addOpening(createEmptyState(), localDate(2026, 8, 27), "first").state;
    const selected = selectReason(state, "nothing");
    expect(selected.selectedReason).toBe("nothing");
    expect(selected.undoId).toBe("first");
    expect(selected.records[0]?.reason).toBe("just-because");
    expect(selectReason(selected, "nothing")).toBe(selected);
  });
});

describe("local calendar aggregation", () => {
  it("formats a local date and midnight without mutating the input", () => {
    const date = localDate(2026, 8, 27, 23, 59, 58);
    expect(getDateKey(date)).toBe("2026-08-27");
    expect(startOfLocalDay(date)).toBe(localDate(2026, 8, 27, 0).getTime());
    expect(date.getHours()).toBe(23);
  });

  it("provides zero-filled hourly and Monday-to-Sunday weekly charts", () => {
    const stats = getStats([], localDate(2026, 8, 27));
    expect(stats).toMatchObject({ today: 0, week: 0, total: 0, lastOpenedAt: null });
    expect(stats.hourly).toEqual(Array(24).fill(0));
    expect(stats.weekly.map((day) => day.label)).toEqual(["月", "火", "水", "木", "金", "土", "日"]);
    expect(stats.weekly.filter((day) => day.isToday)).toEqual([{ dateKey: "2026-08-27", label: "木", count: 0, isToday: true }]);
  });

  it("counts midnight in the new local day while retaining the full history", () => {
    const entries = [
      record("yesterday", localDate(2026, 8, 26, 23, 59, 59)),
      record("midnight", localDate(2026, 8, 27, 0)),
      record("late", localDate(2026, 8, 27, 23, 59, 59)),
      record("tomorrow", localDate(2026, 8, 28, 0)),
    ];
    expect(getStats(entries, localDate(2026, 8, 27))).toMatchObject({ today: 2, week: 4, total: 4 });
    expect(getStats(entries, localDate(2026, 8, 28, 0))).toMatchObject({ today: 1, total: 4 });
  });

  it("keeps Sunday in the week that started on the preceding Monday", () => {
    const entries = [
      record("previous-sunday", localDate(2026, 8, 23, 23, 59, 59)),
      record("monday", localDate(2026, 8, 24, 0)),
      record("sunday", localDate(2026, 8, 30, 23, 59, 59)),
      record("next-monday", localDate(2026, 8, 31, 0)),
    ];
    const stats = getStats(entries, localDate(2026, 8, 30, 23, 59, 59));
    expect(stats).toMatchObject({ today: 1, week: 2, total: 4 });
    expect(stats.weekly[0]).toEqual({ dateKey: "2026-08-24", label: "月", count: 1, isToday: false });
    expect(stats.weekly[6]).toEqual({ dateKey: "2026-08-30", label: "日", count: 1, isToday: true });
    expect(getStats(entries, localDate(2026, 8, 31, 0))).toMatchObject({ today: 1, week: 1, total: 4 });
  });

  it("handles a week that crosses a year boundary", () => {
    const entries = [record("december", localDate(2026, 12, 28)), record("january", localDate(2027, 1, 3)), record("old-week", localDate(2026, 12, 27))];
    const stats = getStats(entries, localDate(2027, 1, 3));
    expect(stats.week).toBe(2);
    expect(stats.weekly.map((day) => day.dateKey)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });

  it.each([
    { season: "spring", now: localDate(2026, 3, 8, 23, 30), first: "2026-03-02", last: "2026-03-08" },
    { season: "autumn", now: localDate(2026, 11, 1, 23, 30), first: "2026-10-26", last: "2026-11-01" },
  ])("keeps seven distinct local dates across the $season DST transition", ({ now, first, last }) => {
    const stats = getStats([record("today", now)], now);
    expect(stats.weekly).toHaveLength(7);
    expect(new Set(stats.weekly.map((day) => day.dateKey)).size).toBe(7);
    expect(stats.weekly[0]?.dateKey).toBe(first);
    expect(stats.weekly[6]).toEqual({ dateKey: last, label: "日", count: 1, isToday: true });
    expect(stats.today).toBe(1);
  });

  it("uses only today's local hours for the hourly chart", () => {
    const entries = [record("zero", localDate(2026, 8, 27, 0)), record("seven-a", localDate(2026, 8, 27, 7)), record("seven-b", localDate(2026, 8, 27, 7, 30)), record("night", localDate(2026, 8, 27, 23)), record("yesterday", localDate(2026, 8, 26, 7))];
    const stats = getStats(entries, localDate(2026, 8, 27, 23, 59));
    expect(stats.hourly[0]).toBe(1);
    expect(stats.hourly[7]).toBe(2);
    expect(stats.hourly[23]).toBe(1);
    expect(stats.hourly.reduce((sum, count) => sum + count, 0)).toBe(4);
  });

  it("finds the latest timestamp even if records are not sorted", () => {
    const latest = record("latest", localDate(2026, 8, 27, 17));
    const entries = [latest, record("oldest", localDate(2026, 8, 26)), record("middle", localDate(2026, 8, 27, 9))];
    expect(getStats(entries, localDate(2026, 8, 27, 18)).lastOpenedAt).toBe(latest.openedAt);
  });
});

describe("elapsed time", () => {
  it("uses an em dash before any opening or for invalid timestamps", () => {
    expect(formatElapsed(null, localDate(2026, 8, 27))).toBe("—");
    expect(formatElapsed("invalid", localDate(2026, 8, 27))).toBe("—");
    expect(formatElapsed("2026-08-27T03:00:00.000Z", new Date("invalid"))).toBe("—");
  });

  it.each([
    [0, "0秒"], [59, "59秒"], [60, "1分"], [61, "1分 1秒"], [3_599, "59分 59秒"],
    [3_600, "1時間"], [3_661, "1時間 1分"], [86_399, "23時間 59分"], [86_400, "1日"], [90_000, "1日 1時間"],
  ])("formats %i elapsed seconds as %s", (seconds, expected) => {
    const now = localDate(2026, 8, 27);
    expect(formatElapsed(new Date(now.getTime() - Number(seconds) * 1_000).toISOString(), now)).toBe(expected);
  });

  it("clamps a future timestamp after a clock change to zero", () => {
    expect(formatElapsed(localDate(2026, 8, 28).toISOString(), localDate(2026, 8, 27))).toBe("0秒");
  });
});

describe("CSV export", () => {
  it("includes a UTF-8 BOM, Japanese headers and a CRLF even with no records", () => {
    expect(toCsv([])).toBe("\uFEFF記録ID,日時（ISO 8601）,日付（ローカル）,時刻（ローカル）,理由\r\n");
  });

  it("exports every record in chronological order with ISO and local date/time", () => {
    const earlier = record("earlier", localDate(2026, 8, 26, 7, 8, 9), "drink");
    const later = record("later", localDate(2026, 8, 27, 10, 11, 12), "nothing");
    const entries = [later, earlier];
    const csv = toCsv(entries);
    expect(csv).toContain(`earlier,${earlier.openedAt},2026-08-26,07:08:09,飲み物\r\n`);
    expect(csv).toContain(`later,${later.openedAt},2026-08-27,10:11:12,開けたけど何も取らなかった\r\n`);
    expect(csv.indexOf("earlier,")).toBeLessThan(csv.indexOf("later,"));
    expect(entries).toEqual([later, earlier]);
  });

  it("escapes commas, double quotes and newlines within a cell", () => {
    const csv = toCsv([record('one,"quoted"\nline', localDate(2026, 8, 27), "check")]);
    expect(csv).toContain('"one,""quoted""\nline",');
    expect(csv).toContain(",中身の確認\r\n");
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "  =1+1", "\tformula"])("neutralises spreadsheet formula prefixes in user-edited IDs: %s", (id) => {
    expect(toCsv([record(id, localDate(2026, 8, 27))])).toContain(`'${id},`);
  });
});

describe("unhelpful messages", () => {
  it("cycles through all three requested messages", () => {
    expect([1, 2, 3].map(getMessage)).toEqual(["中身はさっきと同じです", "何か増えていると思いましたか？", "冷気が逃げました"]);
    expect(getMessage(4)).toBe(getMessage(1));
    expect(getMessage(30)).toBe(getMessage(3));
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("handles an invalid or empty count safely: %s", (count) => {
    expect(getMessage(count)).toBe("中身はさっきと同じです");
  });
});
