import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  apiRequest,
  type ApiTokenDto,
  type ApiTokenIssuedDto,
  type ApiTokenListDto,
} from "../../../shared/lib/api";

const availableScopes = [
  "projects:read",
  "projects:write",
  "assets:read",
  "assets:write",
  "creative:read",
  "creative:write",
  "previews:read",
  "previews:write",
  "exports:read",
  "exports:write",
  "image-generations:read",
  "image-generations:write",
] as const;

export function ApiTokenSettings() {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState<ApiTokenDto[]>([]);
  const [tokenName, setTokenName] = useState("NovelCreator Codex");
  const [tokenScopes, setTokenScopes] = useState<string[]>([
    ...availableScopes.slice(0, 8),
  ]);
  const [expiresAt, setExpiresAt] = useState("");
  const [issuedToken, setIssuedToken] = useState<string>();
  const [errorKey, setErrorKey] = useState<string>();

  useEffect(() => {
    void loadTokens();
  }, []);

  async function loadTokens() {
    try {
      const result = await apiRequest<ApiTokenListDto>("/settings/api-tokens");
      setTokens(result.items);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  async function issueToken(event: FormEvent) {
    event.preventDefault();
    setIssuedToken(undefined);
    try {
      const issued = await apiRequest<ApiTokenIssuedDto>(
        "/settings/api-tokens",
        {
          method: "POST",
          body: JSON.stringify({
            name: tokenName,
            scopes: tokenScopes,
            expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          }),
        },
      );
      setIssuedToken(issued.token);
      await loadTokens();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  async function revokeToken(tokenId: string) {
    try {
      await apiRequest<void>(`/settings/api-tokens/${tokenId}`, {
        method: "DELETE",
      });
      await loadTokens();
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  function toggleScope(scope: string) {
    setTokenScopes((current) =>
      current.includes(scope)
        ? current.filter((item) => item !== scope)
        : [...current, scope],
    );
  }

  return (
    <section className="api-token-settings" aria-labelledby="api-token-title">
      <div>
        <h2 id="api-token-title">{t("settings.apiTokens.title")}</h2>
        <p>{t("settings.apiTokens.description")}</p>
      </div>
      <form className="token-form" onSubmit={(event) => void issueToken(event)}>
        <label>
          <span>{t("settings.apiTokens.name")}</span>
          <input
            required
            maxLength={100}
            value={tokenName}
            onChange={(event) => setTokenName(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>{t("settings.apiTokens.scopes")}</legend>
          <div className="scope-grid">
            {availableScopes.map((scope) => (
              <label key={scope}>
                <input
                  type="checkbox"
                  checked={tokenScopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                <code>{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          <span>{t("settings.apiTokens.expiresAt")}</span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
          <small>{t("settings.apiTokens.expiresHint")}</small>
        </label>
        {errorKey ? (
          <p role="alert" className="form-error">
            {t(errorKey)}
          </p>
        ) : null}
        <button type="submit" disabled={tokenScopes.length === 0}>
          {t("settings.apiTokens.issue")}
        </button>
      </form>
      {issuedToken ? (
        <div className="issued-token" role="status">
          <strong>{t("settings.apiTokens.issued")}</strong>
          <p>{t("settings.apiTokens.issuedWarning")}</p>
          <textarea readOnly rows={3} value={issuedToken} />
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(issuedToken)}
          >
            {t("settings.apiTokens.copy")}
          </button>
        </div>
      ) : null}
      <div className="token-list">
        {tokens.length === 0 ? (
          <p>{t("settings.apiTokens.empty")}</p>
        ) : (
          tokens.map((token) => (
            <article key={token.id} className="token-card">
              <div>
                <strong>{token.name}</strong>
                <code>{token.token_prefix}…</code>
                <small>
                  {t("settings.apiTokens.created", {
                    date: new Date(token.created_at).toLocaleString(),
                  })}
                </small>
                <small>
                  {token.expires_at
                    ? t("settings.apiTokens.expires", {
                        date: new Date(token.expires_at).toLocaleString(),
                      })
                    : t("settings.apiTokens.noExpiry")}
                </small>
                {token.last_used_at ? (
                  <small>
                    {t("settings.apiTokens.lastUsed", {
                      date: new Date(token.last_used_at).toLocaleString(),
                    })}
                  </small>
                ) : null}
              </div>
              <div>
                <span>
                  {token.revoked_at
                    ? t("settings.apiTokens.revoked")
                    : t("settings.apiTokens.active")}
                </span>
                {!token.revoked_at ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void revokeToken(token.id)}
                  >
                    {t("settings.apiTokens.revoke")}
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
