# AivisSpeech連携手順

## 概要

DougaはAivisSpeech EngineのHTTP APIをバックエンドから呼び出し、生成したWAVをログインユーザー専用の音声素材として保存します。編集画面でタイムラインを右クリックし「音声素材を追加」を開くと、話者・スタイル、文章、話速、感情表現、テンポ、音量を指定できます。生成完了後は現在の再生位置へナレーションクリップが追加されます。

## Windowsでの準備

1. [AivisSpeech公式サイト](https://aivis-project.com/AivisSpeech)からAivisSpeechをインストールする。
2. Douga APIとWebを通常どおり起動する。
3. 編集画面の音声設定を開く。DougaがEngineへ接続できない場合、標準インストール先の`run.exe`をバックグラウンド起動する。

初回のEngine起動ではモデルがダウンロードされ、完了まで数分かかる場合があります。

## 環境変数

| 変数 | 既定値 | 用途 |
| --- | --- | --- |
| `AIVIS_BASE_URL` | `http://127.0.0.1:10101` | Engineの接続先 |
| `AIVIS_ENGINE_PATH` | 未指定 | 標準外の`run.exe`または`run`の絶対パス |
| `AIVIS_AUTO_START` | `true` | ローカルEngineを必要時に自動起動するか |
| `AIVIS_REQUEST_TIMEOUT_SECONDS` | `180` | 1回のAPI要求のタイムアウト |
| `AIVIS_STARTUP_TIMEOUT_SECONDS` | `300` | 初回起動を待つ最大時間 |
| `AIVIS_MAX_TEXT_LENGTH` | `500` | 1回に生成できる最大文字数 |

Engineを手動起動する例:

```powershell
& 'C:\Program Files\AivisSpeech\AivisSpeech-Engine\run.exe' --host 127.0.0.1 --port 10101
```

疎通確認は`http://127.0.0.1:10101/version`、EngineのSwagger UIは`http://127.0.0.1:10101/docs`です。

## 公開環境

- ブラウザからEngineへ直接接続させない。
- `AIVIS_BASE_URL`は運用者が管理する内部接続先に限定する。
- Engineを別プロセスまたはコンテナで管理する場合は`AIVIS_AUTO_START=false`にする。
- Engineのポートをインターネットへ直接公開しない。
- 利用する音声モデルごとの利用条件・クレジット表記を公開前に確認する。
