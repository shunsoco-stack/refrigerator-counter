import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const STORAGE_KEY = "refrigerator-counter:v1";
const THEME_KEY = "refrigerator-counter:theme";
const FIXED_TIME = new Date("2026-08-30T12:00:00+09:00");
const VIEWPORT = { width: 1440, height: 1280 };
const WEEK_COUNTS = [2, 4, 3, 6, 8, 5, 7];
const REASON_IDS = ["drink", "food", "just-because", "check", "nothing"];
const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = resolve(projectDirectory, "public", "screenshots");

function requirePublicUrl(value) {
  if (!value) throw new Error("BASE_URLに公開済みアプリのhttps URLを指定してください。localhostからの撮影は許可していません。");
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateHost = isIP(hostname) !== 0 || !hostname.includes(".") || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal");
  if (url.protocol !== "https:" || privateHost || url.username || url.password || url.search || url.hash) {
    throw new Error("認証情報・クエリを含まない、公開https URLでのみ撮影できます。");
  }
  return url.href;
}

function resolveChromium() {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath) {
    if (!existsSync(explicitPath)) throw new Error(`指定されたChromiumが見つかりません: ${explicitPath}`);
    return { executablePath: explicitPath };
  }
  const bundledPath = chromium.executablePath();
  if (existsSync(bundledPath)) return { executablePath: bundledPath };
  const chromePaths = process.platform === "win32"
    ? [
        join(process.env.ProgramFiles ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
        join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"),
        join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "Google", "Chrome", "Application", "chrome.exe"),
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/opt/google/chrome/chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"];
  if (chromePaths.some((path) => existsSync(path))) return { channel: "chrome" };
  throw new Error("Chromiumが見つかりません。Chromeをインストールするか、npx playwright install chromium を実行してください。");
}

function emptyState() {
  return { version: 1, records: [], unlockedAchievements: [], undoId: null, selectedReason: "just-because" };
}

function recordsForDay(dateKey, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `screenshot-fixture-${dateKey}-${index + 1}`,
    openedAt: new Date(`${dateKey}T${String(8 + Math.floor(index / 3)).padStart(2, "0")}:${String((index % 3) * 15).padStart(2, "0")}:00+09:00`).toISOString(),
    reason: REASON_IDS[index % REASON_IDS.length],
  }));
}

function withRecords(records) {
  return { ...emptyState(), records, undoId: records[records.length - 1]?.id ?? null };
}

function weeklyState() {
  return withRecords(WEEK_COUNTS.flatMap((count, index) => recordsForDay(`2026-08-${24 + index}`, count)));
}

const baseURL = requirePublicUrl(process.env.BASE_URL);
await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true, ...resolveChromium() });

async function capture(filename, fixture, prepare, description) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light", reducedMotion: "reduce", serviceWorkers: "allow" });
  try {
    // Preserve the SDK queue without reporting synthetic screenshots as usage.
    await context.route(/\/_vercel\/insights\/|^https:\/\/va\.vercel-scripts\.com\//, async (route) => {
      if (route.request().resourceType() === "script") {
        await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* Portfolio capture: synthetic Analytics delivery disabled. */" });
      } else {
        await route.fulfill({ status: 204, body: "" });
      }
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Freeze Date, not timers: dialogs, hydration and transitions still finish.
    await page.clock.setFixedTime(FIXED_TIME);
    await page.addInitScript(({ key, state, themeKey }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem(themeKey, "light");
    }, { key: STORAGE_KEY, state: fixture, themeKey: THEME_KEY });
    const response = await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    assert(response?.ok(), `公開ページが正常応答しませんでした: ${response?.status()}`);
    requirePublicUrl(page.url());
    await expect(page).toHaveTitle(/冷蔵庫カウンター/);
    await expect(page.locator('.app-shell[data-ready="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /冷蔵庫を開けた/ })).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await prepare(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.deepEqual(pageErrors, [], "撮影中にブラウザの実行時エラーが発生しました。");
    const destination = join(outputDirectory, filename);
    const png = await page.screenshot({ path: destination, fullPage: false, animations: "disabled", caret: "hide", scale: "css" });
    assert.equal(png.readUInt32BE(16), VIEWPORT.width);
    assert.equal(png.readUInt32BE(20), VIEWPORT.height);
    console.log(`[capture] ${filename} | source=${page.url()} | HTTP=${response.status()} | ${VIEWPORT.width}x${VIEWPORT.height} | ${description}`);
  } finally {
    await context.close();
  }
}

try {
  await capture("01-initial.png", emptyState(), async (page) => {
    await expect(page.getByTestId("today-count")).toHaveText("0");
    await expect(page.getByTestId("week-count")).toHaveText("0");
    await expect(page.getByTestId("total-count")).toHaveText("0");
    await expect(page.getByTestId("last-opened")).toHaveText("—");
  }, "初期画面 / empty local browser state");

  await capture("02-counted.png", { ...weeklyState(), selectedReason: "drink" }, async (page) => {
    await expect(page.getByTestId("today-count")).toHaveText("7");
    await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
    await expect(page.getByTestId("today-count")).toHaveText("8");
    await expect(page.getByTestId("total-count")).toHaveText("36");
    await expect(page.getByTestId("last-opened")).toHaveText("12:00:00");
    await expect(page.getByRole("status")).toContainText("冷気が逃げました");
  }, "加算後 / simulated local history + real UI click");

  await capture("03-reason-selector.png", weeklyState(), async (page) => {
    await page.getByRole("button", { name: /開けた理由/ }).click();
    const dialog = page.getByRole("dialog", { name: "開けた理由", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".reason-options").getByRole("button")).toHaveCount(5);
    for (const label of ["飲み物", "食べ物", "なんとなく", "中身の確認", "開けたけど何も取らなかった"]) {
      await expect(dialog.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
  }, "理由選択 / simulated local history + real dialog interaction");

  await capture("04-weekly-chart.png", weeklyState(), async (page) => {
    await page.getByRole("button", { name: "週間", exact: true }).click();
    const chart = page.getByTestId("weekly-chart");
    await expect(chart).toBeVisible();
    await expect(page.getByTestId("week-count")).toHaveText("35");
    for (const [index, label] of ["月", "火", "水", "木", "金", "土", "日"].entries()) {
      await expect(chart).toHaveAttribute("aria-label", new RegExp(`${label}曜日 ${WEEK_COUNTS[index]}回`));
    }
  }, "週間グラフ / simulated Monday–Sunday local history");

  await capture("05-achievement-unlocked.png", withRecords(recordsForDay("2026-08-30", 9)), async (page) => {
    await expect(page.getByTestId("today-count")).toHaveText("9");
    await page.getByRole("button", { name: /冷蔵庫を開けた/ }).click();
    await expect(page.getByTestId("today-count")).toHaveText("10");
    const dialog = page.getByRole("dialog", { name: "実績解除", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "確認のプロ", exact: true })).toBeVisible();
    await expect(dialog.getByText("1日10回の開閉を達成", { exact: true })).toBeVisible();
  }, "実績解除 / nine simulated openings + real tenth UI click");

  console.log(`公開URL ${baseURL} から5枚すべてを検証・撮影しました: ${outputDirectory}`);
} finally {
  await browser.close();
}
