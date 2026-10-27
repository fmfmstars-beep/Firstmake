# ひとつ道具 — AI感を減らす / 権利リスクを下げる修正

対象: https://hitotsu-tools.pages.dev/

## 方針

- 実用品らしい情報設計を優先し、詩的・抽象的なランディングページ表現を減らす
- 生成AIによる写真・説明用イメージは画面から外す
- 装飾はCSS・タイポグラフィ・罫線を中心にし、第三者写真を前提にしない
- Googleの公式ログイン素材とOSSライセンス表示は削除しない
- ユーザーがアップロードした画像プレビューは隠さない
- ログイン、D1同期、画像/PDF処理のJavaScriptには触れない

## 既存デプロイでAI素材として監査対象になった資産

- /assets/alpine-demo.webp
- /assets/cat-demo.webp
- /assets/forest-light.webp
- /assets/morning-lake.webp
- /assets/morning-lake-small.webp
- /assets/woodland-light.webp
- /assets/retention-blog.webp
- /assets/retention-blog-small.webp
- /assets/retention-documents.webp
- /assets/retention-documents-small.webp
- /assets/retention-product.webp
- /assets/retention-product-small.webp
- /assets/hitotsu-share.jpg（OG共有画像。別途、自作SVG/図形ベース画像に差し替える）

## 適用ファイル

`ai-free-override.css` を既存の本番CSSの後で読み込む。

## 公開前の必須確認

1. /api/me が本番と同じ応答を返す
2. Googleログイン・メールコードログインの既存Functionsを維持
3. 画像圧縮 / リサイズ / 形式変換 / 切り抜き
4. PDF結合
5. 二次元コード作成
6. 文字数カウント
7. 連続加工
8. 320 / 375 / 390 / 430px とPC表示
9. /licenses の表現を、実際に残した素材と一致させる
10. THIRD_PARTY_NOTICES.txt と Adobe AFM の既存ライセンス文書を維持

## 現在の注意

公開中の最新デプロイは Pages Functions を含むが、GitHub main にその完全なFunctionsソースが見つかっていない。
静的ファイルだけで再デプロイすると Functions が消えるため、本番へは上書きしないこと。
