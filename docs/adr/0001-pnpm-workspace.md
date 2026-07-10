# ADR-0001: pnpm workspaceを使用する

- Status: Accepted
- Date: 2026-07-11

## Context

ReactアプリとTypeScript共有packageを単一リポジトリで管理し、依存の重複と生成物のずれを抑える必要がある。

## Decision

Node.js package managerにpnpmを使用し、`apps/*`と`packages/*`をworkspace memberとする。package managerのバージョンはルート`package.json`で固定する。

## Consequences

- Web、Project Schema、Scene Rendererをworkspace参照できる。
- CIとローカルで同じlockfileを使用する。
- npmのみを前提とした手順はpnpm用に読み替える必要がある。
