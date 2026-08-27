import { readFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createEmptyState, parseStoredState, STORAGE_KEY, type CounterState, type OpeningRecord, type ReasonId } from "../src/lib/counter";
import { SITE_URL } from "../src/lib/site";

const FIXED_TIME = new Date("2026-08-30T12:00:00+09:00");
const THEME_KEY = "refrigerator-counter:theme";
const READY_SELECTOR = '.app-shell[data-ready="true"]';
const WEEK_COUNTS = [2, 4, 3, 6, 8, 5, 7];
const REASON_IDS: ReasonId[] = ["drink", "food", "just-because", "check", "nothing"];
type AnalyticsEvent = { name: string; data?: Record<string, string | number | boolean> };
type TestWindow = Window & { vaq?: unknown[][]; testShares?: ShareData[]; testCopies?: string[] };

function recordsForDay(dateKey: string, count: number): OpeningRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `fixture-${dateKey}-${index + 1}`,
    openedAt: new Date(`${dateKey}T${String(8 + Math.floor(index / 3)).padStart(2, "0")}:${String((index % 3) * 15).padStart(2, "0")}:00+09:00`).toISOString(),
    reason: REASON_IDS[index % REASON_IDS.length] ?? "just-because",
  }));
}

function withRecords(records: OpeningRecord[]): CounterState {
  return { ...createEmptyState(), records, undoId: records[records.length - 1]?.id ?? null };
}

function weeklyState(): CounterState {
  return withRecords(WEEK_COUNTS.flatMap((count, index) => recordsForDay(`2026-08-${24 + index}`, count)));
}

async function stopAnalyticsDelivery(context: BrowserContext): Promise<void> {
  // The real SDK still initializes window.va/vaq. Its delivery script is replaced
  // with a no-op so synthetic events never pollute the public app's analytics.
  await context.route(/\/_vercel\/insights\/|^https:\/\/va\.vercel-scripts\.com\//, async (route) => {
    if (route.request().resourceType() === "script") {
      await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* E2E: preserve the real Analytics SDK queue without sending synthetic events. */" });
    } else {
      await route.fulfill({ status: 204, body: "" });
    }
  });
}

async function waitForReady(page: Page): Promise<void> {
  await expect(page.locator(READY_SELECTOR)).toBeVisible();
  await expect(page.getByRole("button", { name: /冷蔵庫を開けた/ })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

async function openApp(page: Page, options: { state?: CounterState; raw?: string | null; now?: Date; expectReady?: boolean } = {}): Promise<void> {
  // setFixedTime freezes Date only; timers, hydration and UI effects keep running.
  await page.clock.setFixedTime(options.now ?? FIXED_TIME);
  const raw = options.raw === undefined ? JSON.stringify(options.state ?? createEmptyState()) : options.raw;
  await page.addInitScript(({ key, value }) => {
    // Seed once. A reload or another tab must keep the state created by the UI.
    if (value !== null && localStorage.getItem(key) === null) localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: raw });
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  if (options.expectReady !== false) await waitForReady(page);
}

async function readState(page: Page): Promise<CounterState> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  const parsed = parseStoredState(raw);
  expect(parsed.error).toBeNull();
  return parsed.state;
}

async function chooseReason(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: /開けた理由/ }).click();
  const dialog = page.getByRole("dialog", { name: "開けた理由", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

async function analyticsEvents(page: Page): Promise<AnalyticsEvent[]> {
  return page.evaluate(() => {
    const queue = (window as TestWindow).vaq ?? [];
    return queue.filter((entry) => entry[0] === "event").map((entry) => entry[1] as AnalyticsEvent);
  });
}

async function stubNativeShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as TestWindow).testShares = [];
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => { (window as TestWindow).testShares?.push(data); },
    });
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test.beforeEach(async ({ context }) => {
  await stopAnalyticsDelivery(context);
});

test("空の画面から1回を記録し、理由・時刻・全集計を保存する", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openApp(page, { raw: null });
  await expect(page.getByTestId("today-count")).toHaveText("0");
  await expect(page.getByTestId("week-count")).toHaveText("0");
  await expect(page.getByTestId("total-count")).toHaveText("0");
  await expect(page.getByTestId("last-opened")).toHaveText("—");
  await expect(page.getByTestId("elapsed-time")).toHaveText("—");
  await expect(page.getByRole("button", { name: "直前の1回を戻す" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "CSVを書き出す" })).toBeDisabled();

  await chooseReason(page, "飲み物");
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await expect(page.getByTestId("week-count")).toHaveText("1");
  await expect(page.getByTestId("total-count")).toHaveText("1");
  await expect(page.getByTestId("last-opened")).toHaveText("12:00:00");
  await expect(page.getByTestId("elapsed-time")).toHaveText("0秒");
  await expect(page.getByRole("status")).toContainText("中身はさっきと同じです");
  const stored = await readState(page);
  expect(stored.records).toHaveLength(1);
  expect(stored.records[0]).toMatchObject({ reason: "drink", openedAt: FIXED_TIME.toISOString() });
  expect(stored.undoId).toBe(stored.records[0]?.id);

  await page.reload();
  await waitForReady(page);
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: /開けた理由/ })).toContainText("飲み物");
  expect((await readState(page)).records).toEqual(stored.records);
  expect(errors).toEqual([]);
});

test("理由選択は5項目を表示し、選んだ理由を次の記録へ適用する", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: /開けた理由/ }).click();
  const dialog = page.getByRole("dialog", { name: "開けた理由", exact: true });
  await expect(dialog.locator(".reason-options").getByRole("button")).toHaveCount(5);
  await expect(dialog.getByRole("button", { name: "なんとなく", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const label of ["飲み物", "食べ物", "なんとなく", "中身の確認", "開けたけど何も取らなかった"]) {
    await expect(dialog.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await dialog.getByRole("button", { name: "開けたけど何も取らなかった", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  expect((await readState(page)).records[0]?.reason).toBe("nothing");
});

test("Undoは直前の1件だけを戻し、リロード後も二重取り消しできない", async ({ page }) => {
  await openApp(page);
  const button = page.getByRole("button", { name: /冷蔵庫を開けた/ });
  await button.click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await button.click();
  await expect(page.getByTestId("today-count")).toHaveText("2");
  const undo = page.getByRole("button", { name: "直前の1回を戻す" });
  await undo.click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await expect(undo).toBeDisabled();
  expect((await readState(page)).undoId).toBeNull();
  await page.reload();
  await waitForReady(page);
  await expect(undo).toBeDisabled();
  await expect(page.getByTestId("total-count")).toHaveText("1");
});

test("9→10回で実績を解除し、保存・Undo後も実績を維持する", async ({ page }) => {
  await openApp(page, { state: withRecords(recordsForDay("2026-08-30", 9)) });
  await expect(page.getByTestId("today-count")).toHaveText("9");
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  const dialog = page.getByRole("dialog", { name: "実績解除", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "確認のプロ", exact: true })).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("10");
  expect((await readState(page)).unlockedAchievements).toEqual([{ id: "checking-pro", unlockedAt: FIXED_TIME.toISOString(), dateKey: "2026-08-30" }]);
  await dialog.getByRole("button", { name: "引き続き、見守る" }).click();
  await page.reload();
  await waitForReady(page);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("解除済み", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "直前の1回を戻す" }).click();
  await expect(page.getByTestId("today-count")).toHaveText("9");
  await expect(page.getByText("解除済み", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("10");
  await expect(dialog).not.toBeVisible();
});

test("時間帯と月曜始まりの週間グラフを切り替える", async ({ page }) => {
  await openApp(page, { state: weeklyState() });
  await expect(page.getByTestId("hourly-chart")).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("7");
  await expect(page.getByTestId("week-count")).toHaveText("35");
  const weekly = page.getByRole("button", { name: "週間", exact: true });
  await weekly.click();
  await expect(weekly).toHaveAttribute("aria-pressed", "true");
  const chart = page.getByTestId("weekly-chart");
  await expect(chart).toBeVisible();
  for (const [index, label] of ["月", "火", "水", "木", "金", "土", "日"].entries()) {
    await expect(chart).toHaveAttribute("aria-label", new RegExp(`${label}曜日 ${WEEK_COUNTS[index]}回`));
  }
  await page.getByRole("button", { name: "時間帯", exact: true }).click();
  await expect(page.getByTestId("hourly-chart")).toBeVisible();
});

test("CSVダウンロードへ古い履歴も含め、BOM・ISO・ローカル日時・日本語理由を出力する", async ({ page }) => {
  const entries = [
    { id: "past-record", openedAt: "2026-07-01T00:08:09.000Z", reason: "food" as const },
    { id: "today-record", openedAt: "2026-08-30T01:11:12.000Z", reason: "drink" as const },
  ];
  await openApp(page, { state: withRecords(entries) });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSVを書き出す" }).click()]);
  expect(download.suggestedFilename()).toBe("refrigerator-counter-2026-08-30.csv");
  const path = await download.path();
  if (!path) throw new Error("CSVファイルを取得できませんでした。");
  const csv = await readFile(path, "utf8");
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain("記録ID,日時（ISO 8601）,日付（ローカル）,時刻（ローカル）,理由\r\n");
  expect(csv).toContain("past-record,2026-07-01T00:08:09.000Z,2026-07-01,09:08:09,食べ物\r\n");
  expect(csv).toContain("today-record,2026-08-30T01:11:12.000Z,2026-08-30,10:11:12,飲み物\r\n");
  expect(csv.split("\r\n")).toHaveLength(4);
  await expect(page.getByText("2件の記録をCSVに書き出しました。", { exact: true })).toBeVisible();
});

test("対応端末ではネイティブ共有へサマリーと公開URLを渡す", async ({ page }) => {
  await stubNativeShare(page);
  await openApp(page, { state: withRecords(recordsForDay("2026-08-30", 2)) });
  await page.getByRole("button", { name: "結果を共有", exact: true }).click();
  await expect(page.getByText("今日の成果を共有しました。", { exact: true })).toBeVisible();
  const shares = await page.evaluate(() => (window as TestWindow).testShares ?? []);
  expect(shares).toHaveLength(1);
  expect(shares[0]).toMatchObject({ title: "冷蔵庫カウンター", url: SITE_URL });
  expect(shares[0]?.text).toContain("今日2回");
  expect(shares[0]?.text).toContain("今週2回 / 累計2回");
  expect(JSON.stringify(shares)).not.toContain("fixture-");
});

test("ネイティブ共有非対応時は結果とURLをクリップボードへコピーする", async ({ page }) => {
  await page.addInitScript(() => {
    (window as TestWindow).testCopies = [];
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { (window as TestWindow).testCopies?.push(text); } },
    });
  });
  await openApp(page);
  await page.getByRole("button", { name: "結果を共有", exact: true }).click();
  await expect(page.getByText("結果とURLをコピーしました。", { exact: true })).toBeVisible();
  const copies = await page.evaluate(() => (window as TestWindow).testCopies ?? []);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toContain("今日0回");
  expect(copies[0]).toContain(SITE_URL);
  expect(copies[0]).toContain("#冷蔵庫カウンター");
});

test("共有とクリップボードを使えない場合も手動コピー画面を表示する", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  });
  await openApp(page);
  await page.getByRole("button", { name: "結果を共有", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "結果を共有", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "共有用の文章" })).toHaveValue(new RegExp(SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("表示テーマの選択を保存し、リロードとシステム設定変更に対応する", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "ダークモード", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe("dark");
  await page.reload();
  await waitForReady(page);
  await expect(page.getByRole("button", { name: "ダークモード", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "システムモード", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "ライトモード", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

for (const width of [320, 390, 768, 1440]) {
  test(`${width}px幅でも記録画面と理由ダイアログが横にはみ出さない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await openApp(page, { state: { ...weeklyState(), selectedReason: "nothing" } });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("button", { name: /冷蔵庫を開けた/ })).toBeInViewport();
    await page.getByRole("button", { name: /開けた理由/ }).click();
    const dialog = page.getByRole("dialog", { name: "開けた理由", exact: true });
    await expect(dialog).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(-1);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width + 1);
  });
}

for (const [name, raw] of [
  ["壊れたJSON", '{"version":1,"records":'],
  ["未知のバージョン", JSON.stringify({ ...createEmptyState(), version: 99 })],
] as const) {
  test(`${name}は警告し、元データを上書きしない`, async ({ page }) => {
    await openApp(page, { raw, expectReady: false });
    const warning = page.getByRole("alert").filter({ hasText: "記録を安全に保存できません" });
    await expect(warning).toBeVisible();
    await expect(page.locator(".app-shell")).toHaveAttribute("data-ready", "false");
    await expect(page.getByRole("button", { name: /冷蔵庫を開けた/ })).toBeDisabled();
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
    await page.reload();
    await expect(warning).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw);
  });
}

test("保存容量エラー時は操作を反映せず、既存記録を保持する", async ({ page }) => {
  await openApp(page, { state: withRecords(recordsForDay("2026-08-30", 1)) });
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await page.evaluate((storageKey) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === storageKey) throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return original.call(this, key, value);
    };
  }, STORAGE_KEY);
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByText(/今回の操作は反映していません/)).toBeVisible();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(before);
  expect((await analyticsEvents(page)).some((event) => event.name === "fridge_opened")).toBe(false);
  await page.reload();
  await waitForReady(page);
  await expect(page.getByTestId("today-count")).toHaveText("1");
});

test("保存領域の一時的な読み取り失敗から同じデータで復旧できる", async ({ page }) => {
  await openApp(page, { state: withRecords(recordsForDay("2026-08-30", 1)) });
  await page.evaluate((storageKey) => {
    const original = Storage.prototype.getItem;
    let failOnce = true;
    Storage.prototype.getItem = function (key: string) {
      if (key === storageKey && failOnce) {
        failOnce = false;
        throw new DOMException("Synthetic temporary read failure", "SecurityError");
      }
      return original.call(this, key);
    };
    window.dispatchEvent(new Event("refrigerator-counter:change"));
  }, STORAGE_KEY);
  await waitForReady(page);
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("2");
  expect((await readState(page)).records).toHaveLength(2);
  await expect(page.locator(".storage-warning")).toHaveCount(0);
});

test("日曜から月曜へ日跨ぎすると今日・今週だけをリセットする", async ({ page }) => {
  await openApp(page, { now: new Date("2026-08-30T23:59:59+09:00") });
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await page.clock.setFixedTime(new Date("2026-08-31T00:00:01+09:00"));
  await expect(page.getByTestId("today-count")).toHaveText("0");
  await expect(page.getByTestId("week-count")).toHaveText("0");
  await expect(page.getByTestId("total-count")).toHaveText("1");
  await expect(page.getByTestId("elapsed-time")).toHaveText("2秒");
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await expect(page.getByTestId("week-count")).toHaveText("1");
  await expect(page.getByTestId("total-count")).toHaveText("2");
});

test("複数タブの記録・理由・Undoをstorageイベントで同期する", async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await second.clock.setFixedTime(FIXED_TIME);
  await second.goto("/");
  await waitForReady(second);
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(second.getByTestId("today-count")).toHaveText("1");
  await chooseReason(second, "食べ物");
  await expect(page.getByRole("button", { name: /開けた理由/ })).toContainText("食べ物");
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(second.getByTestId("today-count")).toHaveText("2");
  await second.getByRole("button", { name: "直前の1回を戻す" }).click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  await expect(second.getByTestId("today-count")).toHaveText("1");
  await expect(page.getByRole("button", { name: "直前の1回を戻す" })).toBeDisabled();
  await second.close();
});

test("2タブで同時に押しても両方の記録を失わない", async ({ page, context }) => {
  await openApp(page);
  const second = await context.newPage();
  await second.clock.setFixedTime(FIXED_TIME);
  await second.goto("/");
  await waitForReady(second);
  await Promise.all([
    page.getByRole("button", { name: /冷蔵庫を開けた/ }).click(),
    second.getByRole("button", { name: /冷蔵庫を開けた/ }).click(),
  ]);
  await expect(page.getByTestId("today-count")).toHaveText("2");
  await expect(second.getByTestId("today-count")).toHaveText("2");
  const state = await readState(page);
  expect(state.records).toHaveLength(2);
  expect(new Set(state.records.map((entry) => entry.id)).size).toBe(2);
  expect((await readState(second)).records).toEqual(state.records);
  await second.close();
});

test("主要操作がVercel Analyticsの実SDKキューへ入り、個別履歴を送らない", async ({ page }, testInfo) => {
  await stubNativeShare(page);
  await openApp(page, { state: withRecords(recordsForDay("2026-08-30", 9)) });
  await expect.poll(() => page.evaluate(() => typeof (window as Window & { va?: unknown }).va)).toBe("function");
  await chooseReason(page, "飲み物");
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await page.getByRole("dialog", { name: "実績解除", exact: true }).getByRole("button", { name: "引き続き、見守る" }).click();
  await page.getByRole("button", { name: "週間", exact: true }).click();
  await page.getByRole("button", { name: "ダークモード", exact: true }).click();
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSVを書き出す" }).click()]);
  await page.getByRole("button", { name: "結果を共有", exact: true }).click();
  await page.getByRole("button", { name: "直前の1回を戻す" }).click();
  await expect(page.getByTestId("today-count")).toHaveText("9");
  const events = await analyticsEvents(page);
  expect(events).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "reason_selected", data: { reason: "drink" } }),
    expect.objectContaining({ name: "fridge_opened", data: { reason: "drink" } }),
    expect.objectContaining({ name: "achievement_unlocked", data: { threshold: 10 } }),
    expect.objectContaining({ name: "chart_viewed", data: { view: "weekly" } }),
    expect.objectContaining({ name: "theme_changed", data: { theme: "dark" } }),
    expect.objectContaining({ name: "csv_exported", data: { recordCount: 10 } }),
    expect.objectContaining({ name: "result_shared", data: { method: "native" } }),
    expect.objectContaining({ name: "opening_undone" }),
  ]));
  const serialized = JSON.stringify(events);
  for (const forbidden of ["fixture-", "openedAt", "unlockedAt", "undoId", "2026-08-30T"]) expect(serialized).not.toContain(forbidden);
  await testInfo.attach("analytics-sdk-events", { body: JSON.stringify(events, null, 2), contentType: "application/json" });
});

test("manifest・PWAアイコン・OG画像を公開ページから取得できる", async ({ page, request }) => {
  await openApp(page);
  const manifestPath = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestPath).toBeTruthy();
  const manifestResponse = await request.get(new URL(manifestPath ?? "/manifest.webmanifest", page.url()).href);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as { name: string; display: string; start_url: string; icons: { src: string; sizes: string; purpose?: string }[] };
  expect(manifest).toMatchObject({ name: "冷蔵庫カウンター", display: "standalone", start_url: "/" });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, page.url()).href)).ok()).toBe(true);
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogImage).toBeTruthy();
  // Use the tested deployment origin even when metadata contains the canonical URL.
  const ogPath = new URL(ogImage ?? "/opengraph-image.png", page.url()).pathname;
  const imageResponse = await request.get(new URL(ogPath, page.url()).href);
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["content-type"]).toContain("image/");
});

test("本番PWAはオフライン再読込後も記録・保存を続けられる", async ({ page, context }, testInfo) => {
  test.skip(process.env.E2E_PRODUCTION === "0", "next devではService Workerを登録しないため、本番ビルドで実行します。");
  test.setTimeout(60_000);
  await openApp(page);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state ?? null), { timeout: 25_000 }).toBe("activated");
  await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
  await expect(page.getByTestId("today-count")).toHaveText("1");
  // Network interception can interfere with Chromium's offline emulation.
  // The Analytics script is already a no-op; remove routing before going offline.
  await context.unrouteAll({ behavior: "wait" });
  const canFetchUncachedManifest = () => page.evaluate(async () => {
    try {
      // cache:no-store also bypasses this app's Service Worker. This checks the
      // actual network rather than navigator.onLine, which is only a browser hint.
      return (await fetch(`/manifest.webmanifest?e2e-offline-probe=${crypto.randomUUID()}`, { cache: "no-store" })).ok;
    } catch {
      return false;
    }
  });
  expect(await canFetchUncachedManifest()).toBe(true);
  await context.setOffline(true);
  try {
    expect(await canFetchUncachedManifest()).toBe(false);
    const response = await page.reload({ waitUntil: "domcontentloaded" });
    expect(response?.fromServiceWorker()).toBe(true);
    await waitForReady(page);
    expect(await canFetchUncachedManifest()).toBe(false);
    const evidence = { offlineMethod: "Playwright context.setOffline", shellFromServiceWorker: response?.fromServiceWorker(), uncachedNetworkAvailable: false, browserOnlineHint: await page.evaluate(() => navigator.onLine) };
    await testInfo.attach("offline-evidence", { body: JSON.stringify(evidence), contentType: "application/json" });
    console.log(`PWA offline evidence: ${JSON.stringify(evidence)}`);
    await expect(page.getByTestId("today-count")).toHaveText("1");
    await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
    await expect(page.getByTestId("today-count")).toHaveText("2");
    expect((await readState(page)).records).toHaveLength(2);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await expect(page.getByTestId("today-count")).toHaveText("2");
  } finally {
    await context.setOffline(false);
  }
});
