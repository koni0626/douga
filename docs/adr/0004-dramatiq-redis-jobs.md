# ADR-0004: RedisジョブキューにDramatiqを使用する

- 状態: Accepted
- 決定日: 2026-07-11

## 決定

長時間処理の配送にはRedisとDramatiq 2系を使用する。PostgreSQLの`jobs`テーブルを利用者向け状態の正とし、Redisは配送と再試行に限定する。メッセージはJSONで表現できる識別子と非機密設定だけにし、任意Pythonオブジェクトを復元するpickleは使用しない。

## 理由

- APIプロセスからFFmpeg、画像生成、メディア派生物生成を分離できる。
- Redis broker、再試行、time limit、async actorを利用できる。
- 比較したarqはメンテナンス専用状態で、Python 3.14互換性の未解決事項があるため採用しない。
- CeleryはMVPの運用規模に対して設定面が大きい。

## 影響

- APIはDBのジョブ行を作成してcommitした後に配送する。
- 配送失敗を検出し、未配送のqueued行を再配送する仕組みを設ける。
- Workerは冪等にし、現在statusを条件に状態遷移する。
- Redis消失後もPostgreSQLの状態から復旧可能にする。
