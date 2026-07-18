# フォントライブラリ設計

## 目的

Douga のテキストオブジェクトで、日本語動画に適したフリーライセンスのフォントを選択できるようにする。利用者の端末にフォントがインストールされていなくても、編集プレビューと MP4 書き出しで同じ見た目を再現する。

## 実装方針

- フォント配布には Fontsource の npm パッケージを使用する。
- 同梱フォントはすべて SIL Open Font License 1.1 の書体に限定する。
- 日本語サブセットの WOFF2、標準ウェイト 400 のみを Web アプリへ同梱する。
- フォント定義は `apps/web/src/fonts.css`、選択肢は `apps/web/src/features/projects/lib/fontCatalog.ts` で管理する。
- 編集画面と動画レンダラーは同じ React/SVG レンダリング経路を使用する。
- MP4 書き出しでは Chromium の `document.fonts.ready` を待ってから各フレームを撮影する。
- 未知の既存 `font_family` 値は削除せず、フォールバックを含む CSS `font-family` として保持する。

## 同梱フォント

| 分類 | フォント |
| --- | --- |
| ゴシック体 | Noto Sans JP、M PLUS 1p、Zen Kaku Gothic New、Dela Gothic One、DotGothic16、RocknRoll One、Sawarabi Gothic、Reggae One |
| 明朝・筆文字 | Noto Serif JP、Zen Old Mincho、Shippori Mincho、Kaisei Decol、Sawarabi Mincho、Yuji Syuku |
| 丸文字・手書き・デザイン | M PLUS Rounded 1c、Zen Maru Gothic、Yomogi、Hachi Maru Pop、Kiwi Maru、Mochiy Pop One |

加えて、端末依存の標準フォントとして `sans-serif`、`serif`、`monospace` を選択できる。ただし、標準フォントは端末やレンダリング環境によって字形が変わる可能性がある。

## ライセンス

配布ビルドには次のファイルを含める。

- `/licenses/fonts/NOTICE.txt`: 書体ごとの著作権表示
- `/licenses/fonts/OFL-1.1.txt`: SIL Open Font License 1.1 全文

フォントを追加するときは、商用利用と再配布が許可されていること、ライセンス本文と著作権表示を配布物へ含められることを確認する。OFL 以外のライセンスを追加する場合は、同じ手順で個別のライセンスファイルを同梱する。

## フォント追加手順

1. 公式配布元と Fontsource のメタデータでライセンスを確認する。
2. `apps/web/package.json` にバージョン固定で Fontsource パッケージを追加する。
3. `apps/web/src/fonts.css` に日本語 WOFF2 の `@font-face` を追加する。
4. `fontCatalog.ts` に表示名、CSS font-family、分類を追加する。
5. `NOTICE.txt` に著作権表示を追記する。
6. カタログテスト、i18n チェック、型チェック、Web テスト、ビルドを実行する。

## 制約

- 現時点では標準ウェイト 400 のみを同梱する。太字や細字を正確に使い分ける機能を追加する場合は、必要なウェイトだけを追加する。
- 日本語サブセットに含まれない文字は CSS の後続フォントへフォールバックする。
- 同梱フォントはビルドサイズを増加させるため、追加時に `dist` のサイズを確認する。
