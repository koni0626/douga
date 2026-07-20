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

## AIナレーション付き動画の一括作成

編集画面のチャットとREST APIは同じOrchestratorを使う。動画全体の作成依頼では、AIは原則として`compose_narrated_video`を使用し、文章量からミリ秒を推測せずに次を一括処理する。

1. 意味単位のセクションと、表示文・読み上げ文を分離したキューを組み立てる。
2. AivisSpeechでキューごとに音声を生成する。
3. WAVの実フレーム数から境界を計算し、1本のマスターナレーションへ連結する。
4. 画像、見出し、テロップ、マスター音声を同じ境界に配置する。
5. 音声・テロップ・画像・動画尺の整合性を検証してから、Project Revisionを1件だけ保存する。

既存動画のナレーション全体や読みだけを変更する依頼では`rebuild_narration_master`、保存済み構成の再検証には`validate_narrated_video`が使われる。作成後の局所修正には従来のタイムライン編集ツールが使われる。

読みが曖昧な語は、会話で表示文字と読みを明示する。例えば「表示は『辛い』のまま、読みは『カライ』」と依頼すると、テロップには`display_text`、AivisSpeechには`speech_text`が渡る。同じ語を繰り返し使う場合は読み辞書として扱われ、生成Assetのメタデータには適用後の`resolved_speech_text`と実測境界が保存される。

`replace_scope=generated_draft`ではAI生成部分を置換し、既存のBGMと効果音は保持する。タイムライン全体を置換する`entire_timeline`は破壊的操作のため承認待ちになる。処理中はSSEに`validate_input`、`synthesize_narration`、`compile_master_audio`、`build_document`、`validate_document`、`save_revision`、`completed`の進捗イベントが流れる。

一括作成ツールの成功結果には、保存済み`revision_number`、`master_audio_asset_id`、`duration_ms`、セクション数、キュー数、および`validation.valid`と`validation.issues`が含まれる。`validation.valid=true`かつ`issues=[]`になるまで、AIは完成したとは回答しない。

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
