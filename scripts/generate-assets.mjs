/**
 * 冷蔵庫カウンターの画像資産を、ローカルのSVG/HTMLから再生成する。
 * 実行: npm run assets
 *
 * 外部通信・有料API・乱数・日時には依存しない。PNGの描画にはPlaywrightの
 * Chromium（なければインストール済みChrome）と日本語システムフォントを使う。
 * 同じブラウザとフォント環境では同じ出力になる。
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appDirectory = join(projectRoot, "src", "app");
const iconsDirectory = join(projectRoot, "public", "icons");
const sourceIcon = join(projectRoot, "public", "icons", "fridge.svg");
const background = "#f3f6f7";
const ogAlt =
  "冷蔵庫カウンター。開けた回数だけ、真剣に。役に立ちそうで、ほとんど役に立たない。白い二扉冷蔵庫と本日の開閉回数を描いた紹介画像。";
const japaneseFonts =
  '"Yu Gothic UI", "Yu Gothic", "Hiragino Sans", "Noto Sans CJK JP", "Noto Sans JP", Meiryo, system-ui, sans-serif';

async function exists(path) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findBrowser() {
  const explicitBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitBrowser) {
    if (!(await exists(explicitBrowser))) {
      throw new Error("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH のファイルが見つかりません。");
    }
    return explicitBrowser;
  }

  const candidates = [
    chromium.executablePath(),
    process.env.PROGRAMFILES &&
      join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] &&
      join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  throw new Error(
    "Chromium/Chromeが見つかりません。npx playwright install chromium を実行してから再試行してください。",
  );
}

function iconDocument(svg, fullBleed) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body { background: ${fullBleed ? background : "transparent"}; }
  svg { display: block; width: 100%; height: 100%; }
  ${fullBleed ? "#icon-background, #icon-glow { rx: 0; }" : ""}
</style></head><body>${svg}</body></html>`;
}

function ogDocument(svg) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; }
  body { font-family: ${japaneseFonts}; color: #17282e; background: ${background}; }
  .artboard { position: relative; width: 1200px; height: 630px; isolation: isolate; }
  .wash { position: absolute; inset: 0; background: radial-gradient(ellipse at 84% 48%, #dcecf2 0%, transparent 53%); z-index: -1; }
  .copy { position: absolute; left: 78px; top: 77px; width: 705px; }
  .eyebrow { display: flex; align-items: center; gap: 11px; color: #176b82; font: 650 13px/20px Arial, sans-serif; letter-spacing: .16em; }
  .mark { width: 7px; height: 7px; background: #176b82; border-radius: 50%; }
  h1 { margin: 84px 0 0; font-size: 64px; font-weight: 650; line-height: 1.2; letter-spacing: -.025em; white-space: nowrap; }
  .lead { margin: 27px 0 0; color: #176b82; font-size: 37px; font-weight: 600; line-height: 1.45; letter-spacing: -.025em; white-space: nowrap; }
  .description { margin: 25px 0 0; color: #617680; font-size: 21px; font-weight: 450; line-height: 1.6; letter-spacing: -.01em; white-space: nowrap; }
  .stage { position: absolute; left: 801px; top: 75px; width: 330px; height: 477px; border: 1px solid rgba(255,255,255,.95); border-radius: 44px; background: linear-gradient(145deg, rgba(255,255,255,.82), rgba(241,247,250,.7)); box-shadow: 0 30px 60px rgba(91,125,140,.10), inset 0 1px 0 #fff; }
  .fridge { position: absolute; left: 710px; top: 22px; width: 512px; height: 512px; }
  .fridge svg { display: block; width: 100%; height: 100%; }
  .fridge #icon-background, .fridge #icon-glow { display: none; }
  .counter { position: absolute; left: 800px; top: 431px; width: 278px; height: 115px; padding: 20px 23px; border: 1px solid rgba(255,255,255,.97); border-radius: 26px; background: rgba(255,255,255,.92); box-shadow: 0 14px 34px rgba(76,112,128,.12); display: flex; align-items: center; justify-content: space-between; }
  .counter-label { margin: 0; color: #526e7a; font-size: 15px; font-weight: 600; letter-spacing: .025em; }
  .counter-note { margin: 8px 0 0; color: #7a8e97; font-size: 12px; line-height: 1.4; }
  .counter-value { display: flex; align-items: baseline; gap: 4px; color: #176b82; }
  .counter-value strong { font: 550 52px/1 Arial, sans-serif; letter-spacing: -.055em; font-variant-numeric: tabular-nums; }
  .counter-value span { font-size: 15px; font-weight: 500; }
  .footnote { position: absolute; left: 80px; bottom: 74px; display: flex; align-items: center; gap: 10px; color: #7b8f98; font-size: 16px; font-weight: 450; }
  .footnote::before { content: ""; width: 21px; height: 1px; background: #a4bfc9; }
</style></head><body>
<main class="artboard">
  <div class="wash"></div>
  <div class="copy">
    <div class="eyebrow"><span class="mark"></span>REFRIGERATOR COUNTER</div>
    <h1>冷蔵庫カウンター</h1>
    <p class="lead">開けた回数だけ、真剣に。</p>
    <p class="description">役に立ちそうで、ほとんど役に立たない。</p>
  </div>
  <div class="stage"></div>
  <div class="fridge">${svg}</div>
  <div class="counter">
    <div><p class="counter-label">本日の開閉</p><p class="counter-note">ちゃんと記録しました。</p></div>
    <div class="counter-value"><strong>08</strong><span>回</span></div>
  </div>
  <div class="footnote">記録は、あなたのブラウザの中に。</div>
</main></body></html>`;
}

async function renderPng(page, html, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return page.screenshot({
    type: "png",
    animations: "disabled",
    caret: "hide",
    omitBackground: true,
    scale: "css",
  });
}

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error("PNGの生成結果が不正です。");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function encodeIco(images) {
  // ICOの各ディレクトリエントリにPNGを格納する標準的な形式。
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;

  for (const [index, png] of images.entries()) {
    const { width, height } = pngDimensions(png);
    if (width !== height || width > 256) throw new Error("ICOの寸法が不正です。");
    const position = 6 + index * 16;
    header.writeUInt8(width === 256 ? 0 : width, position);
    header.writeUInt8(height === 256 ? 0 : height, position + 1);
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(png.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += png.length;
  }

  return Buffer.concat([header, ...images]);
}

async function save(path, buffer, dimensions) {
  await writeFile(path, buffer);
  const name = relative(projectRoot, path).replaceAll("\\", "/");
  const bytes = Buffer.byteLength(buffer).toLocaleString("en-US");
  console.log(`${name}: ${dimensions} / ${bytes} bytes`);
}

async function main() {
  const svg = await readFile(sourceIcon, "utf8");
  if (!svg.includes('viewBox="0 0 512 512"') || !svg.includes('id="refrigerator"')) {
    throw new Error("public/icons/fridge.svg のviewBoxまたは冷蔵庫グループが見つかりません。");
  }

  await Promise.all([
    mkdir(appDirectory, { recursive: true }),
    mkdir(iconsDirectory, { recursive: true }),
  ]);

  const executablePath = await findBrowser();
  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      locale: "ja-JP",
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    // すべてインラインで描画する。外部通信を許可しない。
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();

    for (const size of [192, 512]) {
      const png = await renderPng(page, iconDocument(svg, false), size, size);
      await save(join(iconsDirectory, `icon-${size}.png`), png, `${size}×${size}`);
    }

    // 本体は512pxキャンバスの中央80%の円内に収まり、マスクで欠けない。
    const maskable = await renderPng(page, iconDocument(svg, true), 512, 512);
    await save(join(iconsDirectory, "icon-maskable-512.png"), maskable, "512×512 / maskable");

    const apple = await renderPng(page, iconDocument(svg, true), 180, 180);
    await save(join(appDirectory, "apple-icon.png"), apple, "180×180");

    const faviconImages = [];
    for (const size of [16, 32, 48]) {
      faviconImages.push(await renderPng(page, iconDocument(svg, false), size, size));
    }
    await save(join(appDirectory, "favicon.ico"), encodeIco(faviconImages), "16×16 + 32×32 + 48×48");
    await save(join(appDirectory, "icon.svg"), svg, "512×512 / SVG");

    const og = await renderPng(page, ogDocument(svg), 1200, 630);
    const { width, height } = pngDimensions(og);
    if (width !== 1200 || height !== 630 || og.length > 8 * 1024 * 1024) {
      throw new Error("OG画像がNext.jsの寸法・サイズ要件を満たしていません。");
    }
    await save(join(appDirectory, "opengraph-image.png"), og, "1200×630");
    await save(join(appDirectory, "opengraph-image.alt.txt"), `${ogAlt}\n`, "alt text");
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
