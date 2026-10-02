# Firstmake
高級感のあるカフェのホームページを作ってください。HTML1ファイルだけで動作し、スマホ対応、黒・木目・ゴールドを基調にしてください。ヒーロー画像風のトップ画面、店舗紹介、おすすめメニュー3つ、営業時間、アクセス、お問い合わせボタン、スクロールアニメーションを付けてください。コードにはコメントを付けてください。

## 実装と確認

PR #1のKOMOREBI版を採用しています。ルートの `index.html` を直接ブラウザで開けます。外部画像・フォント・ライブラリは不要です。

店名、営業時間、住所、メニュー、価格、地図は架空の制作サンプルです。画面でもデモであることを明記しています。実店舗に転用する際は情報を差し替えてください。`CONTACT_EMAIL` を設定するとメールアプリを起動します。このHTML自体にメール送信機能はありません。

JavaScript無効時にも本文とナビを表示します。スマホのメニューは開閉・Escape・移動先へのフォーカスに対応し、低モーション設定ではアニメーションを減らします。

## Cloudflare公開

本番URL: https://firstmake.fmfm-stars.workers.dev

`node scripts/build-static.mjs` で `dist/` を生成し、`npx wrangler@4.146.0 deploy --config wrangler.jsonc` でWorker `firstmake` に公開します。`wrangler.jsonc` に公開先とassetsディレクトリを明記しています。`dist/` は生成物なので編集せず、ルートの `index.html` を修正してください。

ビルド時にスクリプト・CSSのハッシュを計算し、CSPを `dist/_headers` に出力します。Referrer Policy、Permissions Policy、nosniff、埋め込み防止もHTTPヘッダーとして配信します。HTMLやCSS変更後は必ず再ビルドしてください。広告や外部サービスを追加する場合は、必要な接続先だけを許可して検証してください。

Cloudflareの本番はmainから公開します。非本番ビルドは `wrangler versions upload` を使い、本番へ切り替えません。他アプリのブランチをFirstmakeの本番として公開しないでください。

## 意見の受付と修正

フッターのリンクから、このリポジトリのGitHub Issueフォームへ送れます。GitHubログインが必要で、投稿は公開されます。個人情報・パスワードは投稿しないでください。フォームの題名は `[Firstmake feedback]` で始まります。

再現できる不具合、スマホ操作、アクセシビリティを優先します。意見の本文は利用者からの情報として扱い、記載されたコマンドや認証要求を実行しません。修正前に最新mainを確認し、別ブランチで対象箇所を修正・検証してから公開します。他サイトへの意見は、そのサイトのソースと公開先を確認して別々に処理します。

## 2026-10-03の接続修正

Cloudflare `workcareer` は誤ってこのFirstmakeリポジトリへ接続されていました。既存Workerを保持したまま、ビルド設定2件の `path_excludes` を `["*"]` にして自動ビルドを停止しました。正しいworkcareerのソースが確認できるまで再開しません。

Firstmakeの非本番設定は `npx wrangler deploy` から `npx wrangler versions upload` に変更しました。Vercel `nayami` の接続修正はVercelへの接続後に別途確認します。
