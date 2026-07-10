# Douga

画像中心のスライド動画と、ノベルゲーム風に自動送りされるテロップを編集・書き出しするWebアプリです。

## 開発準備

```powershell
Copy-Item .env.example .env
pnpm install
.venv\Scripts\uv.exe sync --all-packages --all-groups
docker compose up -d
```

Webは`pnpm dev:web`、APIは`.venv\Scripts\uv.exe run douga-api`で起動します。APIのlive checkは`http://127.0.0.1:8000/api/v1/health/live`です。

## 品質チェック

```powershell
pnpm generate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
.venv\Scripts\uv.exe run ruff check apps/backend
.venv\Scripts\uv.exe run mypy apps/backend/src apps/backend/tests
.venv\Scripts\uv.exe run pytest
```

設計と実装順序は[実装計画書](docs/implementation-plan.md)を参照してください。
