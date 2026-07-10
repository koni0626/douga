# ADR-0006: Headless Chromiumで共有Rendererを実行する

- Status: Accepted
- Date: 2026-07-11

## Context

ブラウザとサーバーでテロップの折返し・フォント・座標を一致させる必要がある。

## Decision

Scene Rendererを最小render harnessへ読み込み、PlaywrightでHeadless Chromiumを制御して指定時刻のframeを取得する。Python workerは検証済み引数でFFmpegへframeを渡す。

## Consequences

- Browserとexportで同じ描画コードを利用できる。
- Chromiumのバージョンとfontを固定する必要がある。
- frameごとのcapture性能をPhase 0とPhase 9で計測する。
