# ADR-0009: CookieセッションとCSRF方式

- 状態: Accepted
- 決定日: 2026-07-11

## 決定

認証にはランダムな不透明セッショントークンを使い、生値はHttpOnly Cookieだけへ保存する。DBにはSHA-256ハッシュだけを保存する。Cookieは`SameSite=Lax`、本番では`Secure`、pathは`/`とする。

状態変更APIはdouble-submit方式で保護する。読み取り可能なCSRF Cookieと`X-CSRF-Token`ヘッダーの一致、およびセッション行へ保存したCSRFトークンハッシュの一致を検証する。登録・ログインはOrigin検証とレート制限で保護する。

## 理由

ブラウザアプリでアクセストークンをJavaScriptの永続ストレージへ置かず、漏えい範囲を抑えるため。サーバー側でセッションを即時失効でき、MVPのログアウト要件にも適合する。

## 影響

- フロントエンドのAPI通信はcredentialsを含める。
- 本番はHTTPSを必須とする。
- CORSは許可Originを列挙し、ワイルドカードを使わない。
- Cookie、セッショントークン、CSRFトークンはログへ出さない。
