# 日本語音声メモから英語返信を作る機能

更新日：2026-10-07。既存PhraseLaneへ `/reply` を追加する変更の実装・検証記録。

## 確認先と反映範囲

- 確認URL（配信後検証済み）：https://phrase-lane-billing-sandbox.fmfm-stars.workers.dev/reply
- 対象は既存 `phrase-lane-billing-sandbox`。本番Pages・本番Worker、既存DBのスキーマ、Google OAuth設定、Stripe設定は変更しない。
- 既存Sandboxの `AI_ENABLED=false`、`FREE_MONTHLY_BUDGET_USD=0`、`PRO_MONTHLY_BUDGET_USD=0`、`BILLING_ENABLED=false`、`INDEXING_ENABLED=false` を維持する。Google OAuthは未設定。
- この状態の確認URLでは画面・固定例・コピーを確認できる。録音・実AI生成・購入は利用可能と表示せず、既存の準備状態に従って停止する。
- 既存のURL到達範囲を変更せず、新しい公開ホストや一般向け販売を追加しない。`/reply` はサイトマップ対象外で `noindex, nofollow` を付ける。これらの検索除外設定はアクセス認証ではない。AI APIは既存のセッション・Origin・CSRF検証を必要とする。
- Worker version：`18b1e38a21a44d69af8db2a9eaeacf1c`（2026-10-07 23:34 UTC）。配信コードSHA-256：`01963d334190feba6df37ff8f7b95a67a8cd242042fd4d11033d3334dfef81ff`。変更前の配信コードを基準コミット `4f15103` に保存し、その上に機能を追加した。

## 実装した操作

録音開始 → 手動停止または30秒で自動停止 → 日本語文字起こし → 英語返信生成 → 原文・返信確認 → コピー。文字起こしの編集・直接入力からの再生成もできる。メール等への送信は利用者が行う。

- 録音開始時だけマイクを取得し、終了・取消・画面離脱時に解放する。クラウド送信と録音同意を画面で確認する。
- 音声を16kHz・モノラル・PCM16 WAVへ変換。サーバーは実データに基づき2〜30秒・1MiB以下を検証し、無音・不正形式を拒否する。
- メモの事実・数値・日時・固有名詞を保ち、顧客へ送る返信文に整える。途中で切れた出力・空出力・不正な構造は完成結果として返さない。
- コピー拒否時の手動選択、マイク拒否時の文章入力、処理失敗時の再操作を用意する。入力変更・消去後に古い返信を表示・コピーしない。
- ブラウザーで「録音停止→返信表示」を実測する。音声変換・アップロード・サーバー処理・表示を含み、録音時間とは分ける。文字起こし・返信生成のサーバー実測時間も表示する。固定例に処理速度は表示しない。
- `POST /api/reply/audio` と `POST /api/reply/text` を追加し、既存の本人認証、利用枠、予算、同時1件制限、要求IDによる再送制御、結果の短期暗号化保存を共用する。15秒の処理期限と失敗時の枠解放を維持する。
- 既存の翻訳API・翻訳モデルは維持する。返信と翻訳で同じ要求IDを使い回した場合は409にする。

実装：[画面](public/reply.html)、[操作・計測](public/voice-reply.js)、[録音](public/recording.js)、[Worker](src/worker.mjs)。

## サーバー設定

選定構成は既存Cloudflare Workers AIのサーバーbinding `AI.run`。ブラウザーへAPIキーを渡さない。

| Variable | 値 |
|---|---|
| `AI_PROVIDER` | `cloudflare` |
| `REPLY_MODEL` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `REPLY_INPUT_USD_PER_MILLION` | `0.293` |
| `REPLY_OUTPUT_USD_PER_MILLION` | `2.253` |
| `REPLY_TRANSCRIPTION_MODEL` | `@cf/openai/whisper-large-v3-turbo` |
| `REPLY_ASR_USD_PER_MINUTE` | `0.000513` |

上記の価格は予算予約用のUSD単価。実請求額を保証する値ではない。公式資料：[Llama 3.3 70B](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)、[Whisper large v3 turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)。モデルや単価が未設定・不正なら返信APIを停止し、既存翻訳の設定を上書きしない。

OpenAI方式もコード上で対応する。その場合は `AI_PROVIDER=openai`、利用可能なモデル名・単価を設定し、`AI_API_KEY` を対象WorkerのSecretで管理する。キーをGit・画面・配布JavaScript・ログへ保存しない。今回のOpenAI経路の検証はモックであり、実API利用の確認ではない。

既存32 bindings・互換日・ログ設定は反映前後で同一。返信用のモデル・単価5変数だけを追加し、AI・課金の停止状態を維持した。

## 検証結果

| 検証 | 結果と範囲 |
|---|---|
| 返信API自動テスト | 新規15件PASS。認証・CSRF・入力境界・無音・二重消費防止・同時実行・期限切れ・遅延応答・枠解放・モデル別応答・サーバーSecret使用を検証 |
| 既存認証・課金の保全 | 現行デプロイから復元した基準の認証・runtime-config・課金sectionとbyte単位で一致することをレビュー |
| 全自動テスト | 56件中51件PASS、既存課金テスト5件失敗。変更前の現行デプロイ基準でも同じ失敗を再現しており、全テスト成功とは扱わない |
| PC・スマホ幅 | Chromium、320/375/390/430/1440pxで表示・主要操作PASS。横はみ出しを検査 |
| 録音・コピー等 | 既存MessageRecorder（Web Audio）を疑似マイク入力で操作。手動停止・30秒自動停止・コピー・マイク拒否・失敗後再操作・処理中消去を検証。AI応答はfixture |
| 最終構成の実AI統合計測 | 実Worker・SQLite・実Cloudflareモデルで30秒録音→返信表示→コピー一致。詳細は下表 |
| 配信後の検証 | 375/1440px、固定例コピー、料金/アカウント/app導線、未認証APIの401、AI停止表示、noindex/no-store等29件PASS。本番の /reply は404のまま |

自動テスト：[test/voice-reply.test.mjs](test/voice-reply.test.mjs)。実行：`node --test test/voice-reply.test.mjs`。画面検証スクリプト・結果・画像は `/workspace/phraselane-validation/`（`browser-check.mjs`、`artifacts/`）に保存。

### 実AIの測定記録

最終モデル・実Worker処理を使い、検証用ローカルセッションからのブラウザー統合確認を記録する。Google実ログインや本番稼働の確認とは区別する。検証途中の別モデルの測定値は最終性能として掲載しない。

| 項目 | 実測・条件 |
|---|---|
| 実施日時・環境・回線/地域 | 2026-10-07 23:34–23:35 UTC、Linux/Chromium・390px、localhost HTTPS。Cloudflare実APIへのconnector中継を含む。実行地域・一般回線の条件は未固定。本番速度ではない |
| 入力・音声長・件数 | 日本語合成音声26.485秒に無音を足した30秒WAVを疑似マイクで実録音、最終構成1件。Web Audio→16kHz mono PCM16、960,044 bytes |
| 文字起こし時間 | 8.177秒（ローカル中継を含む） |
| 返信生成時間 | 4.592秒（ローカル中継を含む） |
| 録音停止→返信表示 | **12.87秒**。サーバー受信→返信生成完了12.799秒。15秒期限内に成功 |
| 数値・日時・意図とコピーの確認 | 10月22日午前10時（日本時間）への日程変更、バナー3点/ロゴ1点の修正、追加$150、作業前確認を保持。宛名Alexは省略。コピー全文一致・マイク解放・例外0、音声枠30秒確定/予約0 |

## 未完了事項

- Google OAuth設定と実アカウントでのログイン→録音→生成→コピー。現在の確認URLでは固定例の確認に限られる。AI予算・有効化設定も未完了。今回の実AI通し試験はローカル検証用recovery sessionを使用した。
- 実決済・Webhook・契約変更の通し試験。既存課金テスト5件の失敗原因の解消は今回の返信追加とは別の既存課題。
- iOS Safari／Android Chromeの実機・実マイクでの確認。今回の画面検証はChromiumの端末幅変更と疑似入力。
- 10秒音声50件による中央値・95パーセンタイルの計測と、複数話者・雑音環境の品質確認。単発の合成音声測定から仕様の性能目標達成を判断しない。


今回追加した返信機能にDB移行は不要。戻す場合は変更前のSandbox Worker versionへ戻し、既存設定・認証・課金・DBを維持する。本番向けの既存READMEのデプロイ手順を、このSandbox検証への指示として実行しない。

実AI試験の記録：`/workspace/phraselane-validation/artifacts/real-ai-local-report.json`。配信後記録：`deployed-browser-report.md`、`deployed-browser-report.json`。実AI画面：`reply-390-real-ai-local.png`。
