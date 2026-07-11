# 脅威モデル

## 保護対象と境界

保護対象はアカウント、非公開素材、プロジェクト文書、生成プロンプト、OpenAI API key、完成動画である。ブラウザは信頼せず、API、DB、Redis、worker、OpenAI、ストレージを別の信頼境界として扱う。

| 脅威 | 主な対策 |
| --- | --- |
| 他ユーザーの ID を指定した閲覧・更新 | 全 Repository query の `user_id` 条件、複合外部キー、tenant isolation test |
| Session/CSRF の悪用 | Argon2id、opaque session、HttpOnly/Secure/SameSite cookie、CSRF double submit、Origin 検証 |
| upload 偽装・path traversal | 実体検査、上限付き streaming、server-generated storage key、resolve 後の root 検証 |
| XSS と renderer 注入 | React の text escape、厳格な Project JSON Schema、CSP、任意 HTML を受け付けない |
| FFmpeg command injection | shell を使わず argv 配列、サーバー生成 path、codec/option allowlist、timeout |
| AI の費用濫用・秘密漏えい | API key は server/worker のみ、ユーザー別 quota、prompt をログへ出さない、失敗を一般化 |
| Job の重複実行・改ざん | DB が正本、行 lock による claim、queue には UUID のみ、固定 revision |
| DoS | request/upload/job quota、worker time limit、同時実行数、生成フレームと解像度の schema 上限 |
| 供給網 | lockfile、CI audit、固定 container tag、定期 update |

公開前には HTTPS 終端、trusted proxy、WAF/rate limit、ストレージ暗号化、DB PITR、secret rotation、監査ログ保持期間をホスティング環境で確認する。
