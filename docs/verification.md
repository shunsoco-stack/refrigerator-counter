# 検証・公開記録

実施日：2026 年 8 月 27 日（日本時間）。実装の存在と、ブラウザでの確認、外部サービスでの集計可否を区別して記録しています。

## 結果

| 項目 | 結果 |
| --- | --- |
| `npm run lint` | 成功・警告 0 件 |
| `npm run typecheck` | 成功 |
| `npm run test` | 79 / 79 成功 |
| `npm run build` | Next.js 16.3.3 の本番ビルド成功 |
| ローカル本番 E2E | 24 / 24 成功（19.0 秒） |
| 公開 URL の E2E | 24 / 24 成功（21.0 秒） |
| Secret Scan | Gitleaks 8.30.0、作業ファイル・Git 全履歴とも検出 0 件 |
| GitHub | `shunsoco-stack/refrigerator-counter`、PUBLIC、既定ブランチ `main` |
| Vercel | Production / READY、認証なしのアクセスで HTTP 200 |
| スクリーンショット | 公開アプリから 5 枚撮影、PNG 寸法・画面状態を検証、全画像を目視確認 |
| Analytics | Web Analytics 有効化を API 応答とプロジェクト設定で確認、配信スクリプト HTTP 200 |
| 本番エラーログ | 公開後に `vercel logs --level error --since 1h` を実行し、該当ログ 0 件 |

## 環境・公開先

- Node.js 24.18.0 / npm 11.16.0 / Windows
- Playwright 1.62.1 / Chromium 151
- 単体テストの標準タイムゾーン：`Asia/Tokyo`
- ローカル本番テスト：`http://127.0.0.1:3107`
- 公開アプリ：<https://refrigerator-counter.vercel.app>
- GitHub：<https://github.com/shunsoco-stack/refrigerator-counter>
- 撮影対象のアプリ実装コミット：`a870ab4`
- 撮影対象デプロイ：`dpl_FME5fjScrpZTpETAc2cTQ3Jo65nN`（Next.js、本番、Vercel ビルド約 25 秒）

スクリーンショット・文書・検証スクリプトの更新後も、アプリの実装コードはこの検証対象と同じです。最新リビジョンは GitHub の `main`、最新デプロイは Vercel の Production を参照してください。

## 機能と保存の検証

単体テストでは、保存形式、不正日時、重複 ID、ローカル日付境界、月曜始まり・年越しの週、実績の 10 / 30 / 50 回条件、1 段階 Undo、実績の永久保持、CSV の BOM・引用符・数式対策、経過時間、メッセージを検証しています。

Playwright では、初期表示、5 種類の理由、連続加算、再読み込み後の保存、日跨ぎ、時間帯・週間グラフ、10 / 30 / 50 回の実績、Undo、テーマ、CSV の実ダウンロード、共有の分岐・キャンセル、キーボードとダイアログを確認しています。加えて、破損データの保護、容量超過時の非加算、一時的な保存領域エラーからの復旧、2 タブ同時操作で 2 件とも保存されること、4 種類の画面幅を検証しました。

ブラウザのネイティブ共有 UI はスタブで呼び出し・キャンセルを検証しています。実際の全 OS の共有先や、スマートフォン実機へのインストールを確認済みとするものではありません。

## PWA・オフライン

公開アプリの新しいブラウザコンテキストで以下を実施しました。

1. オンライン表示後、Service Worker が `activated` となり、ページを制御していることを確認。
2. 1 件記録し、一意のクエリ付き `cache: no-store` リクエストがオンラインでは成功することを確認。
3. Playwright の `context.setOffline(true)` を実行し、その実通信が失敗することを確認。
4. 再読み込みの応答が Service Worker 由来で、記録と画面が復元されることを確認。
5. オフラインのまま 2 件目を追加し、もう一度再読み込みして 2 件が残ることを確認。

証拠は `shellFromServiceWorker: true` / `uncachedNetworkAvailable: false`。この Chromium 環境では `navigator.onLine` が `true` のままなので、その値だけをオフライン成功の根拠にはしていません。通信を差し替えるテストの routing は、オフライン確認前に解除しています。

manifest、通常・maskable アイコン、OG 画像の取得も成功しました。初回から通信できない状態、キャッシュ消去後の起動、OS の保存領域回収後、すべてのブラウザでのインストール UI は保証対象外です。

## Secret Scan

`npm run secret:scan` は、Gitleaks の既定ルールを継承した設定で、作業ディレクトリと全ブランチの Git 履歴を検査します。初回公開前と画像・文書追加後に再走査し、両方が検出 0 件・終了コード 0 となることを確認しました。

除外対象は依存パッケージ、ビルド成果物、Git 内部、ローカル Vercel 設定、一時ファイル、テスト結果です。アプリソース・README・掲載用文章は検査対象です。秘密値はログに出さず、JSON レポートは Git 対象外の `tmp/` へ保存します。デプロイ補助が作成した一時認証ファイルは削除し、公開リポジトリには含めていません。

## Analytics と運用上の制限

Hobby プランの Web Analytics を有効にしました。SDK の配信と、8 種類の主要操作で実 SDK キューへ正しいイベントが渡ることを確認しています。履歴一覧・記録 ID・保存された開閉時刻をカスタムプロパティへ含めないこともテストしています。撮影・E2E の模擬イベントは配信を抑止しています。

**Hobby ではカスタムイベントの集計が利用できません。** 主要操作の計測コードは実装済みですが、Pro / Enterprise が必要なダッシュボード集計まで完了したとは扱っていません。ページ閲覧データのダッシュボード反映も、SDK 配信・有効化の確認とは別です。有料プランへの変更、トライアル、追加課金は行っていません。[Vercel 公式のプラン条件](https://vercel.com/docs/analytics/limits-and-pricing)

Drains は 0 件です。公開後のエラーログは確認しましたが、常時の外部エラー監視や通知は設定していません。ログ確認は実施時点までの結果であり、将来の無障害を保証するものではありません。

GitHub 自動デプロイ連携は現在の権限では接続できなかったため、Vercel CLI で公開しています。リポジトリへの push と本番の更新は別操作です。更新手順は README に記載しています。

## 公開アプリから取得した 5 枚

撮影日時：2026 年 8 月 27 日 12:03（日本時間）。全画像の取得元は `https://refrigerator-counter.vercel.app/` で HTTP 200。固定日時は `2026-08-30T12:00:00+09:00`、タイムゾーンは `Asia/Tokyo`、ライトモード、1440 × 1280px です。

| 保存先 | 内容 |
| --- | --- |
| `public/screenshots/01-initial.png` | 空のブラウザ状態：今日・今週・累計 0 |
| `public/screenshots/02-counted.png` | 模擬履歴 + 実際のボタン操作で今日 7 → 8 回 |
| `public/screenshots/03-reason-selector.png` | 実際の理由選択ダイアログ、全 5 種類 |
| `public/screenshots/04-weekly-chart.png` | 模擬の月〜日履歴、週間合計 35 回 |
| `public/screenshots/05-achievement-unlocked.png` | 模擬 9 件 + 実際の 10 回目操作で「確認のプロ」解除 |

日時と記録は表示の再現性のための模擬データです。実利用者の記録・利用実績ではなく、利用者のブラウザ保存領域にもアクセスしていません。全 5 枚を README に埋め込んでいます。

## 再実行

```sh
npm ci
npm run verify
npm run secret:scan
```

Secret Scan には PATH 上の Gitleaks、または `GITLEAKS_BIN` の指定が必要です。ブラウザが未導入の場合は `npx playwright install chromium` を実行します。公開先での再検証・撮影は PowerShell で次のように実行できます。

```powershell
$env:BASE_URL = "https://refrigerator-counter.vercel.app"
npm run test:e2e
npm run screenshots
```

スクリーンショット用スクリプトは公開 HTTPS URL を必須とし、localhost・IP アドレス・認証情報付き URL を拒否します。
