# Douga

画像中心のスライド動画と、ノベルゲーム風に自動送りされるテロップを編集・書き出しするWebアプリです。

## 開発準備

```powershell
Copy-Item .env.example .env
pnpm install
.venv\Scripts\uv.exe sync --all-packages --all-groups
docker compose up -d
```

Webは`pnpm dev:web`、APIは`.venv\Scripts\uv.exe run douga-api`で起動します。Redis job worker は `.venv\Scripts\uv.exe run douga-worker` で起動します（本番は `JOB_DISPATCH_MODE=redis`）。APIのlive checkは`http://127.0.0.1:8000/api/v1/health/live`です。

開発時は `IMAGE_PROVIDER=fake` で課金なしに画像生成フローを確認できます。実際に GPT Image 2 を使う場合だけ `IMAGE_PROVIDER=openai` と `OPENAI_API_KEY` を設定してください。キーはブラウザへ渡しません。

## Codex・NovelCreator連携

設定画面の「外部APIトークン」でPersonal API Tokenを発行し、外部クライアントの`DOUGA_API_TOKEN`へ設定します。トークンは発行時に一度だけ表示され、いつでも設定画面から失効できます。

`douga_manifest.json`から編集可能な動画ドラフトを作成する場合は、次を実行します。

```powershell
$env:DOUGA_API_URL='http://127.0.0.1:8000/api/v1'
$env:DOUGA_WEB_URL='http://127.0.0.1:5173'
$env:DOUGA_API_TOKEN='dga_pat_...'
.venv\Scripts\python.exe -m scripts.douga.create_video_draft path\to\douga_manifest.json
```

API契約、Manifest例、権限、セキュリティ要件は[Codex連携API設計書](docs/codex-integration-api-design.md)を参照してください。
Codex用Skillは[`skills/douga-video-draft`](skills/douga-video-draft)に同梱しています。個人環境ではこのディレクトリを`$CODEX_HOME/skills/douga-video-draft`へ配置して使用します。

## 品質チェック

Integration Testは開発データを保護するため、`.env`の`TEST_DATABASE_URL`で指定した専用DBだけを使用します。`APP_ENV=test`で`TEST_DATABASE_URL`がない場合は接続を拒否し、開発DBへフォールバックしません。初回は専用DBを作成してマイグレーションしてください。

```powershell
$env:APP_ENV='test'
.venv\Scripts\alembic.exe -c apps/backend/alembic.ini upgrade head
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
公開時は[運用手順](docs/operations.md)、[脅威モデル](docs/threat-model.md)、[第三者ライセンス](docs/third-party-licenses.md)も確認してください。
