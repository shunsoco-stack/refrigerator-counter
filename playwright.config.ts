import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, defineConfig } from "@playwright/test";

/** Prefer Playwright's installed Chromium, then an existing Chrome installation. */
function resolveChromium(): { executablePath?: string; channel?: "chrome" } {
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

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const target = new URL(baseURL);
if (!["http:", "https:"].includes(target.protocol)) throw new Error("BASE_URLにはhttpまたはhttpsのURLを指定してください。");
const browser = resolveChromium();

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  metadata: { target: baseURL },
  use: {
    baseURL,
    browserName: "chromium",
    channel: browser.channel,
    launchOptions: browser.executablePath ? { executablePath: browser.executablePath } : undefined,
    headless: true,
    viewport: { width: 1440, height: 1100 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    serviceWorkers: "allow",
    acceptDownloads: true,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium" }],
  // The caller starts `next start` separately. Set BASE_URL for a deployed app.
  // Set E2E_PRODUCTION=0 only when deliberately testing `next dev` (no SW there).
});
