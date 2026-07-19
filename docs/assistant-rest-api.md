# AIアシスタントREST APIマニュアル

## 概要

編集画面右側のAIアシスタントと同じAssistant Orchestratorおよび動画編集ツール群を、Personal API Tokenから利用できる。別実装の簡易チャットではないため、企画相談、画像生成・編集、素材配置、テロップ、ナレーション、カメラ、タイムライン検証、プレビュー、Undoまで編集画面と同じ能力を持つ。

## 必要な設定

設定画面で新しいPersonal API Tokenを発行し、最低限次のスコープを選択する。既存トークンの権限は後から変更できないため、`assistant:*`を持たないトークンは再発行する。

```text
assistant:read
assistant:write
```

外部クライアント自身がプロジェクト作成や素材アップロードも行う場合は、用途に応じて`projects:read`、`projects:write`、`assets:read`、`assets:write`も追加する。トークンは環境変数へ保存し、ソース、Manifest、ログへ記録しない。

```powershell
$env:DOUGA_API_URL='http://127.0.0.1:8000/api/v1'
$env:DOUGA_WEB_URL='http://127.0.0.1:5173'
$env:DOUGA_API_TOKEN='dga_pat_...'
```

## Pythonクライアント

```python
from scripts.douga.assistant_client import DougaAssistantClient
from scripts.douga.client import DougaClient

project_id = "<project UUID>"

with DougaClient.from_env() as client:
    assistant = DougaAssistantClient(client)
    result = assistant.chat(
        project_id,
        "会社紹介動画の構成を考え、編集可能なドラフトへ反映して",
        title="会社紹介動画",
        context={
            "time_ms": 0,
            "visible_start_ms": 0,
            "visible_end_ms": 30_000,
            "attachment_asset_ids": [],
        },
    )

print(result["run"]["status"])
print(result["detail"]["messages"][-1]["content"])
```

既存会話を継続する場合は`thread_id`を`chat()`へ渡す。画像を添付する場合は先に`DougaClient.upload_asset()`でユーザー所有Assetとして登録し、そのUUIDを`attachment_asset_ids`へ指定する。

## 承認待ち

高コスト画像生成や書き出しなどは`waiting_approval`で停止する。会話詳細の`tool_calls`から`status == "waiting_approval"`の呼び出しを選び、承認または却下して同じRunを再度待機する。

```python
detail = assistant.get_thread(project_id, thread_id)
call = next(item for item in detail["tool_calls"] if item["status"] == "waiting_approval")
assistant.approve_tool_call(project_id, call["id"])
run = assistant.wait_for_run(project_id, call["run_id"])
```

## REST処理フロー

1. `POST /projects/{project_id}/assistant/threads`で会話を作る。
2. `POST /projects/{project_id}/assistant/threads/{thread_id}/messages`で依頼を送る。
3. `GET /projects/{project_id}/assistant/runs/{run_id}`またはSSEの`.../events`で完了を待つ。
4. `GET /projects/{project_id}/assistant/threads/{thread_id}`で返答、ツール履歴、成果を取得する。
5. 必要なら`tool-calls/{call_id}/approve`または`reject`を呼ぶ。
6. AIによる変更を取り消す場合は`POST .../runs/{run_id}/undo`を呼ぶ。

Bearer TokenによるすべてのPOSTには`Idempotency-Key`を付ける。付属Pythonクライアントは未指定時に自動生成する。同じ論理操作の再試行では同じキーを再利用する。

## 主な状態

| 状態 | 意味 |
| --- | --- |
| `queued` | 実行待ち |
| `running` | AIまたはツールを実行中 |
| `waiting_approval` | 利用者の承認・却下待ち |
| `completed` | 正常終了 |
| `failed` | 失敗。`error_code`と監査ログを確認 |
| `cancelled` | 取り消し済み |

## セキュリティ

- プロジェクト、会話、添付Assetはすべてトークン所有ユーザーIDで照合する。
- `assistant:read`だけのトークンではメッセージ送信、承認、取消、Undoはできない。
- `assistant:write`だけのトークンでは会話・Run・イベントを参照できない。
- CookieとBearer Tokenを同時送信すると`AUTH_AMBIGUOUS`で拒否する。
- OpenAI APIキーやAivisSpeech設定はDougaサーバー側にだけ置き、RESTクライアントへ渡さない。
