# ADR-0007: 開発時はGPL有効FFmpegをサーバー専用processとして使用する

- Status: Accepted for development; production review required
- Date: 2026-07-11

## Context

ローカル環境のFFmpegは`--enable-gpl`と`libx264`を含む。MVPではH.264 MP4を生成する必要がある。

## Decision

開発・検証では現在のGPL有効FFmpegを独立processとして使用し、`libx264`でH.264を生成する。`--enable-nonfree`を含むbuildは使用しない。Productionでは配布形態、build configuration、codec特許を再確認してimageを固定する。

## Consequences

- 現在の環境でMP4検証を進められる。
- `ffmpeg -buildconf`とversionを成果物へ記録する。
- On-premiseやDesktop配布へ変更する場合はライセンスを再評価する。
