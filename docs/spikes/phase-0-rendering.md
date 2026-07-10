# Phase 0 レンダリング検証記録

## 結果

- ReactとSVGで1920x1080のScene Rendererを実装した。
- 同じRendererへ絶対時刻を渡し、PlaywrightのHeadless Chromiumで決定的にPNG化した。
- 日本語禁則処理、英語の単語折返し、2行ページ分割、typewriter表示を固定テスト化した。
- 150フレーム（5秒、30fps）をFFmpegへ渡し、H.264 / yuv420pのMP4を生成できた。
- 出力は1920x1080、30fps、5秒、150フレームであることをFFprobeで確認する。
- 開発PCではVite起動、150枚のPNG取得、FFmpegエンコードを含め約30.0秒だった。出力MP4は45,911 bytesだった。

## 再現手順

```powershell
pnpm install
pnpm generate
pnpm test
pnpm render:spike
```

生成物は`.local-data/render-spike/`へ置き、Git管理しない。

## 判断

ブラウザプレビューと書き出しで別々の描画実装を持たず、`@douga/scene-renderer`を共有する。Headless Chromiumのスクリーンショット方式は、MVPの品質優先の出発点として採用する。長尺動画の性能はPhase 9で再計測し、必要な場合だけフレームのパイプ転送や区間並列化を追加する。
