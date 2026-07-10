# ADR-0002: Python依存管理にuvを使用する

- Status: Accepted
- Date: 2026-07-11

## Context

FastAPI、worker、開発ツールの依存を再現可能にし、lockfileをリポジトリで共有する必要がある。

## Decision

Python依存管理にuvを使用する。ルートをworkspaceとし、`apps/backend`をmemberにする。開発時のPythonは3.14を使用する。

## Consequences

- `uv.lock`で依存を固定できる。
- Python実行環境にはuvの導入が必要になる。
- Production imageでも同じlockfileから依存を同期する。
