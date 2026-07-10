# ADR-0005: Scene描画にReactとSVGを使用する

- Status: Accepted
- Date: 2026-07-11

## Context

PowerPoint型の画像・テキスト・図形を、ブラウザプレビューとサーバー書き出しで同じ実装から描画する必要がある。

## Decision

共有`scene-renderer` packageをReactコンポーネントとして実装し、出力にSVGを使用する。Editorの選択枠や操作UIはWebアプリ側に置き、純粋なScene描画は共有packageへ置く。

## Consequences

- テキスト、画像、図形、transformをWeb標準で表現できる。
- Headless Chromiumで同じSVGをcaptureできる。
- 動画Layerと高度なfilterは追加検証が必要になる。
