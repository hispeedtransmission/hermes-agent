"""Exercise the enabled Google OAuth client chain across oauthlib's major update.

HTTP is intercepted at requests-oauthlib's transport seam; all credentials and
responses below are deliberately synthetic. No provider transaction is sent.
"""
import json
from urllib.parse import parse_qs, urlparse

import pytest
import requests


def test_google_pkce_exchange_refresh_and_authorized_request(monkeypatch):
    flow_module = pytest.importorskip("google_auth_oauthlib.flow")
    flow = flow_module.Flow.from_client_config(
        {"web": {"client_id": "synthetic-client", "client_secret": "synthetic-secret",
                 "auth_uri": "https://auth.example/authorize", "token_uri": "https://auth.example/token",
                 "redirect_uris": ["https://app.example/callback"]}},
        scopes=["openid"], autogenerate_code_verifier=True)
    flow.redirect_uri = "https://app.example/callback"
    url, state = flow.authorization_url()
    query = parse_qs(urlparse(url).query)
    assert query["code_challenge_method"] == ["S256"]
    assert query["state"] == [state]
    calls = []

    def transport(method, url, **kwargs):
        calls.append((method, url, kwargs))
        response = requests.Response()
        response.request = requests.Request(method, url, data=kwargs.get("data")).prepare()
        response.status_code = 200
        response._content = json.dumps({"access_token": "synthetic-access", "token_type": "Bearer",
                                       "refresh_token": "synthetic-refresh", "expires_in": 3600}).encode()
        response.headers["Content-Type"] = "application/json"
        return response

    monkeypatch.setattr(flow.oauth2session, "request", transport)
    flow.fetch_token(authorization_response="https://app.example/callback?code=synthetic-code&state=" + state)
    data = calls[-1][2]["data"]
    assert data["code_verifier"] == flow.code_verifier
    assert data["grant_type"] == "authorization_code"
    credentials = flow.credentials
    assert credentials.scopes == ["openid"]
    assert credentials.token == "synthetic-access"
    flow.oauth2session.refresh_token("https://auth.example/token", refresh_token="synthetic-refresh")
    assert calls[-1][2]["data"]["grant_type"] == "refresh_token"
    headers = {}
    credentials.apply(headers)
    assert headers["authorization"] == "Bearer synthetic-access"


def test_oauthlib_rejects_callback_state_mismatch():
    oauth2 = pytest.importorskip("oauthlib.oauth2")
    client = oauth2.WebApplicationClient("synthetic-client")
    with pytest.raises(oauth2.MismatchingStateError):
        client.parse_request_uri_response("https://app.example/callback?code=test&state=wrong", state="expected")
