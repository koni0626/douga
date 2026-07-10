# フォルダ構成設計

## 1. 方針

本プロジェクトは、Reactフロントエンド、FastAPIバックエンド、非同期ワーカー、共有レンダラーを1つのリポジトリで管理するモノレポ構成とする。

構成上の原則は次のとおり。

1. デプロイ単位は`apps/`へ置く。
2. 複数アプリから再利用するコードは`packages/`へ置く。
3. バックエンドは機能単位で分割し、各機能内でController、Service、Repositoryを分離する。
4. APIプロセスとワーカープロセスは同じPythonパッケージを利用し、起動方法だけを分ける。
5. ユーザー素材、DB、生成動画などの実データをリポジトリ内へ保存しない。
6. 自動生成コードを手書きコードから分離する。
7. `utils`、`common`、`helpers`を無秩序な置き場にしない。

## 2. ルート構成

```text
douga/
├─ AGENTS.md
├─ README.md
├─ .gitignore
├─ .editorconfig
├─ .env.example
├─ compose.yaml
├─ pyproject.toml                 # Python workspace・共通ツール設定
├─ package.json                   # Node workspace・共通コマンド
├─ apps/
│  ├─ web/                        # React Webアプリ
│  └─ backend/                    # FastAPI API・非同期ワーカー
├─ packages/
│  ├─ project-schema/             # プロジェクトJSONの共通契約
│  └─ scene-renderer/             # ブラウザ・書き出し共通描画
├─ infra/
│  ├─ docker/
│  ├─ nginx/
│  └─ compose/
├─ scripts/
├─ docs/
└─ .local-data/                   # 開発用データ。Git管理外
```

### 2.1 ルートへ置くもの

- リポジトリ全体へ適用する設定
- ワークスペース設定
- ローカル開発環境の起動設定
- 全アプリを対象とするCI設定
- 設計・規約文書

個別アプリだけで使う設定は、そのアプリ配下へ置く。

## 3. Reactフロントエンド

```text
apps/web/
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ eslint.config.js
├─ public/
└─ src/
   ├─ main.tsx
   ├─ app/
   │  ├─ router.tsx
   │  ├─ providers.tsx
   │  ├─ layouts/
   │  └─ error-boundary.tsx
   ├─ features/
   │  ├─ auth/
   │  ├─ projects/
   │  ├─ editor/
   │  ├─ assets/
   │  ├─ image-generation/
   │  ├─ exports/
   │  └─ settings/
   ├─ shared/
   │  ├─ components/
   │  │  └─ ui/
   │  ├─ hooks/
   │  ├─ lib/
   │  ├─ styles/
   │  └─ types/
   ├─ i18n/
   │  ├─ index.ts
   │  ├─ resources.ts
   │  ├─ i18next.d.ts
   │  └─ locales/
   │     ├─ ja/
   │     └─ en/
   ├─ generated/
   │  └─ api/                     # OpenAPIから生成。手編集禁止
   ├─ test/
   │  ├─ setup.ts
   │  ├─ factories/
   │  └─ mocks/
   └─ assets/                     # アプリUI用の静的素材のみ
```

### 3.1 Featureの標準形

機能が小さいうちは必要なファイルだけを作る。最初から空のフォルダを大量に作らない。

```text
features/assets/
├─ api/
├─ components/
├─ hooks/
├─ model/
├─ pages/
├─ tests/
└─ index.ts
```

責務:

- `api/`: 生成済みAPIクライアントを使う機能固有の呼び出し
- `components/`: 素材機能だけで使う表示コンポーネント
- `hooks/`: 素材機能固有の状態と操作
- `model/`: UI状態、変換、選択ロジック
- `pages/`: Routerから直接使用する画面
- `tests/`: 機能単位のテスト
- `index.ts`: 外部へ公開する要素だけをexport

### 3.2 フロントエンドの依存規則

- `app`は`features`と`shared`を利用できる。
- `features`は`shared`と`packages`を利用できる。
- `shared`は特定の`features`へ依存しない。
- Feature間の直接importを増やさず、共通概念は`shared`または適切な共有packageへ移す。
- `generated/api`を直接編集しない。
- `scene-renderer`の内部実装をFeature側へ複製しない。
- ユーザーがアップロードした素材を`src/assets`や`public`へ保存しない。

### 3.3 i18nリソース

```text
src/i18n/
├─ index.ts                       # react-i18next初期化、fallbackLng: ja
├─ resources.ts                   # namespace登録
├─ i18next.d.ts                   # 翻訳キーの型定義
└─ locales/
   ├─ ja/
   │  ├─ common.json
   │  ├─ auth.json
   │  ├─ editor.json
   │  ├─ assets.json
   │  ├─ exports.json
   │  └─ errors.json
   └─ en/
      ├─ common.json
      ├─ auth.json
      ├─ editor.json
      ├─ assets.json
      ├─ exports.json
      └─ errors.json
```

- `ja`と`en`で同じnamespace・キー構造を維持する。
- 既定言語とフォールバックを`ja`に固定する。
- Feature固有の翻訳は対応するnamespaceへ置き、巨大な`common.json`を作らない。
- UI文字列を翻訳キーとして使用せず、`editor.caption.save`のような意味ベースのキーを使う。
- 翻訳キーの型検査と、日英のキー差分検査をCIで実行する。
- ユーザーが入力したプロジェクト名、台本、素材名は翻訳リソースへ入れない。

## 4. FastAPIバックエンド・ワーカー

APIとワーカーは、同じ`douga` Pythonパッケージを別エントリーポイントで起動する。

```text
apps/backend/
├─ pyproject.toml
├─ alembic.ini
├─ Dockerfile.api
├─ Dockerfile.worker
├─ src/
│  └─ douga/
│     ├─ __init__.py
│     ├─ api_main.py
│     ├─ worker_main.py
│     ├─ core/
│     │  ├─ config.py
│     │  ├─ security.py
│     │  ├─ logging.py
│     │  ├─ exceptions.py
│     │  ├─ error_codes.py
│     │  └─ observability.py
│     ├─ db/
│     │  ├─ base.py
│     │  ├─ engine.py
│     │  ├─ session.py
│     │  ├─ unit_of_work.py
│     │  └─ naming.py
│     ├─ modules/
│     │  ├─ auth/
│     │  ├─ projects/
│     │  ├─ assets/
│     │  ├─ image_generation/
│     │  ├─ exports/
│     │  └─ jobs/
│     ├─ integrations/
│     │  ├─ object_storage/
│     │  ├─ openai/
│     │  ├─ ffmpeg/
│     │  ├─ renderer/
│     │  └─ queue/
│     ├─ workers/
│     │  ├─ tasks/
│     │  ├─ media_probe/
│     │  └─ rendering/
│     ├─ middleware/
│     └─ templates/
│        └─ email/                # 将来機能。ja/enで分離
├─ migrations/
│  ├─ env.py
│  ├─ script.py.mako
│  └─ versions/
└─ tests/
   ├─ unit/
   ├─ controller/
   ├─ integration/
   ├─ migration/
   ├─ security/
   ├─ worker/
   ├─ factories/
   └─ conftest.py
```

### 4.1 機能モジュールの標準形

```text
modules/projects/
├─ __init__.py
├─ controller.py
├─ service.py
├─ repository.py
├─ models.py
├─ schemas.py
├─ entities.py                    # ORMと分ける必要がある場合のみ
├─ exceptions.py
└─ policies.py                    # 所有権・状態遷移が複雑な場合のみ
```

各ファイルの責務:

- `controller.py`: FastAPI Router、HTTP入出力、依存注入
- `service.py`: ユースケース、認可、トランザクション
- `repository.py`: SQLAlchemyによる検索・保存
- `models.py`: SQLAlchemy ORMモデル
- `schemas.py`: Pydantic Request / Response
- `entities.py`: DBから独立したドメイン表現が必要な場合だけ作成
- `exceptions.py`: 機能固有の例外
- `policies.py`: 複雑になったビジネス判定

小規模な機能では、不要なファイルを作成しない。`service.py`や`repository.py`が肥大化した場合は、次のようにユースケースまたは集約単位で分割する。

```text
modules/projects/
├─ controllers/
│  ├─ commands.py
│  └─ queries.py
├─ services/
│  ├─ create_project.py
│  ├─ update_project.py
│  └─ duplicate_project.py
├─ repositories/
│  ├─ project_repository.py
│  └─ revision_repository.py
├─ models.py
└─ schemas.py
```

分割は実際に肥大化してから行い、最初から1ユースケース1ファイルへ過剰分割しない。

### 4.2 バックエンドの依存規則

```text
controller -> service -> repository -> db
                    \-> integrations
worker task -> service
```

- ControllerからRepository、Session、ORMモデルを直接操作しない。
- RepositoryはService、Controller、FastAPIへ依存しない。
- Worker taskはControllerを呼ばず、Serviceまたはワーカー専用ユースケースを呼ぶ。
- Repositoryは`commit()`しない。
- トランザクションはService / Unit of Workで確定する。
- ある機能が別機能のRepositoryを直接操作しない。必要な場合は相手のServiceまたは明示したインターフェースを使用する。
- `core`へ機能固有ロジックを置かない。
- `integrations`は外部システムの詳細を隠し、ServiceへSDKレスポンスをそのまま返さない。

### 4.3 `core`と`integrations`の境界

`core`へ置いてよいもの:

- 設定読込
- 共通セキュリティ処理
- ログとトレーシング
- 全体共通の基底例外
- アプリ起動・終了処理

`core`へ置かないもの:

- プロジェクト作成
- 素材所有権
- レンダリング状態遷移
- OpenAI画像生成のユースケース

外部サービス固有のコードは`integrations`へ置く。例として、OpenAI SDKの呼び出し、S3クライアント、FFmpeg引数生成、RedisキューAdapterを含む。

### 4.4 APIとワーカーの起動

- `api_main.py`: FastAPIアプリ生成、Router登録、middleware登録
- `worker_main.py`: ジョブワーカー生成、task登録
- APIイメージとWorkerイメージは同じPythonソースを利用する。
- APIコンテナではFFmpegレンダリングを実行しない。
- Workerのtaskは薄く保ち、ジョブ取得、Service呼び出し、結果記録だけを行う。
- APIは翻訳済み文章ではなく、安定した`error_code`とパラメータを返す。
- 将来のメールテンプレートは`templates/email/{locale}/`へ置き、ユーザーの`preferred_locale`で選択する。

## 5. 共有package

### 5.1 `project-schema`

```text
packages/project-schema/
├─ package.json
├─ schema/
│  ├─ project-v1.schema.json
│  └─ common/
├─ src/
│  ├─ generated/                  # Schemaから生成。手編集禁止
│  ├─ validators.ts
│  └─ index.ts
├─ fixtures/
└─ tests/
```

- プロジェクトJSONの言語非依存な契約を管理する。
- Schemaには明示的なバージョンを持たせる。
- TypeScript型を手書きで二重管理しない。
- バックエンドでも同じJSON Schemaを検証できるようにする。
- 互換性を壊す変更は新しいSchemaバージョンとして追加する。

### 5.2 `scene-renderer`

```text
packages/scene-renderer/
├─ package.json
├─ src/
│  ├─ renderer/
│  ├─ caption-layout/
│  ├─ timing/
│  ├─ fonts/
│  └─ index.ts
├─ fixtures/
├─ tests/
└─ render-harness/
```

- React編集画面とサーバー書き出しで共通利用する。
- API通信、認証、DBアクセスを行わない純粋な描画packageにする。
- 時刻とProject Documentを入力すると、同じ結果を描画できるようにする。
- テスト用フォントとfixtureを固定し、スクリーンショット差分を検証できるようにする。
- `render-harness`はヘッドレスChromiumから描画するための最小ページとする。

## 6. Alembic migration

```text
apps/backend/
├─ alembic.ini
└─ migrations/
   ├─ env.py
   ├─ script.py.mako
   └─ versions/
      └─ YYYYMMDD_HHMM_<revision>_<summary>.py
```

- migrationはバックエンドのSQLAlchemy metadataと同じアプリ配下へ置く。
- revisionファイルはGit管理する。
- 自動生成後に必ず内容をレビューする。
- migration内からService、Repository、外部APIを呼ばない。
- データ移行にアプリモデルをimportしない。将来のモデル変更で過去migrationが壊れるため、migration内の固定Table定義またはSQLを使用する。
- migrationテストは`apps/backend/tests/migration/`へ置く。

## 7. テスト構成

### 7.1 バックエンド

```text
tests/
├─ unit/
│  └─ modules/
│     ├─ projects/test_service.py
│     └─ jobs/test_service.py
├─ controller/
│  └─ modules/
│     └─ projects/test_controller.py
├─ integration/
│  └─ modules/
│     └─ projects/test_repository.py
├─ migration/
├─ security/
│  └─ test_tenant_isolation.py
├─ worker/
├─ factories/
└─ conftest.py
```

テストの配置は実装のフォルダ構造を反映する。ServiceのテストをControllerテストへ混在させない。

### 7.2 フロントエンド

- 小さなUnitテストは対象ファイルの近く、またはFeature内の`tests/`へ置く。
- 全画面にまたがるE2Eは`apps/web/e2e/`へ置く。
- 共通fixtureは`src/test/`へ置き、Feature固有fixtureはFeature内へ置く。
- 生成済みAPIクライアント自体のUnitテストは作らず、生成元と利用側を検証する。
- `ja`と`en`の翻訳キー差分、フォールバック、言語切り替えをUnitテストする。

## 8. インフラ・開発環境

```text
infra/
├─ docker/
│  ├─ postgres/
│  ├─ redis/
│  ├─ minio/
│  └─ ffmpeg/
├─ nginx/
└─ compose/
   ├─ compose.dev.yaml
   └─ compose.test.yaml
```

- `compose.yaml`は通常の開発入口とする。
- 詳細なoverrideは`infra/compose`へ置く。
- 本番クラウドが決まるまで、特定ベンダーのTerraform構成は作らない。
- FFmpegイメージはバージョンとbuild configurationを固定する。

## 9. スクリプト

```text
scripts/
├─ generate-api-client.*
├─ generate-project-types.*
├─ check-migrations.*
├─ render-sample.*
└─ bootstrap-dev.*
```

- 手順が複雑で繰り返し実行する操作だけをスクリプト化する。
- Python・TypeScriptのアプリ本体ロジックを`scripts`へ置かない。
- WindowsとCIで実行する必要があるものは、可能な限り言語ランタイム上で動くスクリプトにする。

## 10. 実データと生成物

次はGit管理しない。

- PostgreSQLデータ
- Redisデータ
- MinIO / S3オブジェクト
- アップロード素材
- AI生成画像
- 完成動画
- レンダリング一時ファイル
- ブラウザやテストのキャッシュ
- `.env`
- カバレッジ出力
- ビルド成果物

ローカル開発用データは`.local-data/`配下へ集約し、`.gitignore`で除外する。本番データのパスやバケット名をコードへハードコードしない。

## 11. 自動生成コード

自動生成コードは次へ限定する。

- `apps/web/src/generated/api/`
- `packages/project-schema/src/generated/`
- ビルド時の一時ディレクトリ

生成コードには「手編集禁止」を明記する。変更が必要な場合は、OpenAPI、JSON Schema、生成設定のいずれかを修正して再生成する。

## 12. 禁止する構成

- すべてのControllerを1つの`controllers.py`へ置く
- すべてのServiceを1つの`services.py`へ置く
- `utils.py`、`common.py`、`helpers.py`へ無関係な処理を集約する
- ControllerからSQLAlchemy Sessionを直接使用する
- Feature間で内部ファイルを相互importする
- WorkerからFastAPI Controllerを呼び出す
- ユーザー素材や生成MP4をリポジトリ配下へ保存する
- migrationから現在のORMモデルやServiceを呼び出す
- 自動生成コードを手編集する
- APIキーや`.env`をリポジトリへ登録する

## 13. 実装開始時に作成する最小構成

初回から全フォルダを作る必要はない。最初の実装では次だけを作成する。

```text
apps/
├─ web/
└─ backend/
   ├─ src/douga/
   │  ├─ api_main.py
   │  ├─ core/
   │  ├─ db/
   │  └─ modules/auth/
   ├─ migrations/
   └─ tests/
packages/
├─ project-schema/
└─ scene-renderer/
infra/compose/
scripts/
docs/
```

素材、プロジェクト、レンダリングなどのフォルダは、その機能を実装する時点で追加する。空フォルダを維持するためだけの`.gitkeep`は原則として作成しない。
