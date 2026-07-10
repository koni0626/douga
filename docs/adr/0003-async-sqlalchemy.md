# ADR-0003: SQLAlchemy AsyncSessionをリクエスト・ジョブ単位で使用する

- Status: Accepted
- Date: 2026-07-11

## Context

FastAPIと外部I/Oを非同期で扱いつつ、SessionをControllerへ漏らさずServiceのUnit of Workでトランザクションを管理する必要がある。

## Decision

SQLAlchemyのAsyncEngineとAsyncSessionを使用する。HTTPリクエストまたはworker jobごとにSessionを作成し、並行task間で共有しない。

## Consequences

- PostgreSQL driverにasyncpgを使用する。
- Repository APIは原則としてasyncになる。
- migrationはAlembicのasync構成を使用する。
