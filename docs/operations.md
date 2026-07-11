# 運用・リリース手順

## 構成

本番環境では Web、API、Dramatiq worker、PostgreSQL、Redis、オブジェクトストレージを分離する。API と worker は同じリリースイメージを使い、FFmpeg/FFprobe、Node.js、Playwright Chromium を worker に含める。`JOB_DISPATCH_MODE=redis`、`IMAGE_PROVIDER=openai` とし、秘密値は環境変数ではなくホスティング基盤の secret store から注入する。

## リリース

1. DB バックアップを取得し、復元テスト済みであることを確認する。
2. CI の format、lint、型検査、unit/integration/E2E、依存関係監査を通す。
3. staging で `alembic upgrade head`、画像生成、10秒 MP4 書き出しを確認する。
4. worker を停止して新規ジョブの取得を止め、API migration job を一度だけ実行する。
5. API、worker、Web の順に切り替え、health、エラー率、queue depth を監視する。

ロールバックでは旧アプリを再配置する。破壊的 migration は単独リリースにせず、expand/contract の2段階にする。migration 自体を戻すのは、データ損失がないことを事前確認できた場合に限る。

## バックアップと復元

PostgreSQL は日次 full backup と point-in-time recovery を有効にし、オブジェクトストレージは versioning と lifecycle を設定する。月1回、隔離環境へ DB と素材を復元し、ユーザー、プロジェクト、素材、書き出しの参照整合性を確認する。

## 監視

API の p95、5xx、認証失敗、PostgreSQL connection、Redis queue depth、job の失敗率・実行時間・heartbeat、ディスク/オブジェクト容量を監視する。`running` のまま heartbeat が timeout を超えた job は、入力が不変であることを確認して再キューする。request ID と job ID を相関キーにし、プロンプト、Cookie、API key、メールアドレスはログへ出さない。

## 定期保守

- 期限切れ session、完了済み job の詳細ログ、孤児になった一時フレームを削除する。
- DB に存在しない storage key と、storage に存在しない DB レコードを dry-run で列挙してから修復する。
- OpenAI 使用量と書き出し時間をユーザー別 quota と比較する。
- FFmpeg、OpenAI SDK、ブラウザ、OS image の脆弱性を月次で確認する。
