# PhraseLane 公開作業 — 2026-10-05

## 状態

- 🟩 音声・テキストMVPと字幕SRT/VTT/TXTを統合。MVPの自動テスト38件とPagesプロキシのテスト3件、ビルド、差分検査が成功。
- 🟩 統合版をCloudflare Sandboxへデプロイ済み。バージョンは`21735127a30f41d089b9178e1ec20e13`。統合版の本番公開は未実施。
- 🟩 本番では既存の公開アセットをそのまま保持し、旧課金バックエンドの強化のみをデプロイ済み。バージョンは`9dd2a59547f14a95baebd3f07dde0d05`。販売は引き続き停止中。
- 🟩 公開料金画面のスクリーンショットを取得済みで、確認用画像を利用可能。
- 🟩 Stripe本番の本人確認・出金先登録・決済受付は有効。本人確認や銀行登録のやり直しは不要。
- 🟩 Stripeの公開サポート住所・電話を両WorkerのSELLER_ADDRESS / SELLER_PHONEへ設定。正式なSELLER_NAMEは未設定なので販売者情報はまだ公開しない。
- 🟩 専用Stripe SandboxのWebhook `we_1UN2skEZGF3krm5O111p58bX` に`charge.refunded`を追加し、既存の11イベントを維持。実際の返金通知から権限更新までの通し検証は未実施。
- 🟩 Cloudflareの公式モデル料金を原価見積りへ設定。SandboxのAI処理と両環境の購入は停止状態を維持。本番の既存無料翻訳は従来の設定を保持。
- 🟧 Stripe本番の商品・Customer Portal設定作成は接続の権限不足で拒否された。商品、価格、Portalの本番作成は未完了。
- 🟧 本番D1の追加移行は認証エラー10000で失敗。後続の読み取りでは旧スキーマのまま。移行は未適用。
- 🟧 Stripe APIキー、Google OAuth、正式な販売者名が未設定。実際のSandbox決済・Googleログイン・AI処理の通し検証は未実施。自動テストやデプロイ成功を、実決済の通し検証完了とは扱わない。

## あなたが入力・承認するもの

### 🟧 1. 接続の権限

Stripe接続の本番アカウント「AIサイト作り」で、商品/価格・Webhook・Customer Portalの設定を変更できる権限を承認してください。別アカウントへの切替や銀行情報の変更は不要です。

CloudflareはWorkersの設定更新とD1の読み取りは成功しましたが、D1のスキーマ更新だけ認証エラーです。接続で対象アカウントのD1編集権限を確認し、必要なら再接続してください。権限を変更したらこちらで移行を再実行します。

### 🟧 2. Stripe制限付きAPIキー

[Stripe APIキー画面](https://dashboard.stripe.com/apikeys)で、テスト用と本番用を別々に作成します。キーはチャットへ貼らず、Cloudflare → Workers & Pages → 対象Worker → Settings → Variables and Secrets に **Secret** として保存します。

| Worker | 変数名 | 値の種類 |
|---|---|---|
| phrase-lane-billing-sandbox | STRIPE_SECRET_KEY | 専用Sandbox「AIサイト作りサンドボックス」の制限付きテストキー |
| phrase-lane | STRIPE_SECRET_KEY | 本番「AIサイト作り」の制限付き本番キー |

統合版で必要な権限は Customers、Subscriptions、Checkout Sessions、Customer Portal Sessionsの読み書き、およびPrices、Invoices、Invoice Payments、Events、Charges、PaymentIntentsの読み取りです。売上管理のBalance読み取りは管理画面用です。最小権限の名称・依存権限はStripe画面で確認し、テスト時の403を見て必要な項目だけ追加します。Webhook署名シークレットは別の値で、APIキーを代入しないでください。

### 🟧 3. Googleログイン

[Google Cloud Console](https://console.cloud.google.com/)のGoogle Auth Platformで、ウェブアプリ用OAuthクライアントを準備します。GOOGLE_CLIENT_IDはVariable、GOOGLE_CLIENT_SECRETはSecretとして対象Workerへ保存します。scopeはopenid emailです。

許可するリダイレクトURI（末尾/なし、完全一致）：

- 本番: https://phrase-lane.fmfm-stars.workers.dev/api/auth/callback
- Sandbox: https://phrase-lane-billing-sandbox.fmfm-stars.workers.dev/api/auth/callback

通常ログインはGoogleの署名付きIDトークンで検証します。管理・削除操作には追加の最近認証条件があります。Google側のSession age claims設定・公開/検証状態を確認するまでは、管理・削除の最近認証が完了したと扱いません。再ログインボタンだけでGoogle認証時刻が更新される保証はありません。

### 🟧 4. 販売者の正式名称

Stripeの公開名「AIサイト作り」は屋号として確認できました。販売事業者として表示する正式な個人氏名または法人名称を確定してください。既存の公開住所・電話は設定済みです。正式名はSELLER_NAMEへ登録します。CONTACT_EMAILは既存サイトの窓口を維持しています。

## こちらで続ける作業

権限が揃ったら本番D1移行、本番Product/Price/Webhook/Portal設定、Google/AI実接続確認、Sandbox Checkout → 支払済みInvoice → 有料枠 → Portal取消 → 期限切れ/失敗/再送の検証を行います。税の販売地域・登録状況も確認し、Stripe Taxは未確認のまま有効化しません。

検証完了後だけBILLING_TESTED / LEGAL_READY / BILLING_ENABLEDを有効にします。フラグをtrueにすること自体は検証の代わりになりません。AI利用予算は現在0のため停止中です。公開時は原価見積りと初期ユーザー数に合わせて上限を設定し、サービス全体の上限を料金ページで明示します。

## 実装・移行記録

新MVPはCloudflare Sandboxのコードから回収しました。回収時のソースは332,662文字で、現在の取得ソースと二つの独立した指紋が一致しました。モジュール境界コメントを保持し、ASSETSだけpublicへ分離しています。参照先worker.js.mapは回収できていないため、元の個別モジュールへの完全復元ではありません。

新MVPのProはUSD9/月、支払済み課金期間ごとに音声7,200秒/600試行・テキスト50,000文字/500試行。以前のUTC暦月・テキスト専用案を上書きせず、この統合案へ置き換えます。旧月額プラン案で販売は開始していません。

schema-mvp.sqlはSandboxの実スキーマ。migrations/0002_mvp_recovered.sqlは旧スキーマからの一度限りの追加移行で、ローカルSQLiteで適用を検証しました。本番への適用は前述の認証エラーで未実施です。既存の開発版と本番の設定・秘密情報を保持してデプロイしてください。

モデル料金確認: https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/ (入力・出力各USD0.342/百万token)、https://developers.cloudflare.com/workers-ai/models/whisper/ (USD0.000453/音声分)。見積りであり、アカウント全体の請求上限を保証するものではありません。
