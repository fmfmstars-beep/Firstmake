# KOGANE ROASTERY

黒・木目・ゴールドを基調にした、架空のスペシャルティコーヒー店のランディングページです。外部ライブラリや外部アセットを使用せず、`index.html` だけで動作します。

## 確認方法

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開いてください。

## 主な仕様

- スマートフォン／デスクトップ対応
- 店舗紹介、おすすめメニュー、営業時間、アクセス、お問い合わせ導線
- `IntersectionObserver` を利用したスクロールアニメーション
- キーボード操作、スキップリンク、低モーション設定への対応
- Content Security Policy、Permissions Policy、Referrer Policyを明示
- 外部通信・外部依存なし

> 住所、電話番号、メールアドレス、価格はデモ用です。公開前に実店舗の情報へ差し替えてください。
