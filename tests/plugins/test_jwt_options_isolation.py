"""JWT trust boundaries never inherit mutable decoder verification defaults.

GHSA-gvp8-978c-rx2q has no advertised fixed version. Keep fresh, explicit
verification options even when a library release happens to copy its input.
All tokens and keys are synthetic; no issuer network calls are made.
"""
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization

from hermes_cli.dashboard_auth import InvalidCodeError, ProviderError
from plugins.cron_providers.chronos.verify import verify_nas_fire_token
from plugins.dashboard_auth._shared import verify_jwt


@pytest.fixture(scope="module")
def keys():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = private.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    return private, public


def _verify(boundary, token, public):
    if boundary == "cron":
        return verify_nas_fire_token(token=token, expected_audience="hermes-test",
            issuer="https://issuer.example", jwks_or_key=public, leeway_seconds=0)
    jwks = SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=public))
    try:
        return verify_jwt(token, jwks, algorithms=["RS256"], audience="hermes-test",
            issuer="https://issuer.example", label="test", leeway=0)
    except (InvalidCodeError, ProviderError):
        return None


def _claims():
    now = int(time.time())
    return dict(exp=now + 300, iat=now - 1, nbf=now - 1, aud="hermes-test",
                iss="https://issuer.example", sub="test-user", jti="test-id", purpose="cron_fire")


@pytest.mark.parametrize("boundary", ["dashboard", "cron"])
@pytest.mark.parametrize("claim,value", [
    ("exp", 1), ("aud", "other-app"), ("iss", "https://other.example"),
    ("nbf", 9999999999), ("iat", 9999999999), ("sub", 123), ("jti", 123),
])
def test_claim_checks_are_explicit_despite_shared_decoder_defaults(monkeypatch, keys, boundary, claim, value):
    # Another consumer's insecure decode/config must not decide this boundary's policy.
    for name in ("exp", "nbf", "iat", "aud", "iss", "sub", "jti"):
        monkeypatch.setitem(jwt.api_jwt._jwt_global_obj.options, "verify_" + name, False)
    private, public = keys
    assert _verify(boundary, jwt.encode(_claims(), private, algorithm="RS256"), public)
    claims = _claims()
    claims[claim] = value
    assert _verify(boundary, jwt.encode(claims, private, algorithm="RS256"), public) is None


@pytest.mark.parametrize("boundary", ["dashboard", "cron"])
def test_decode_options_are_fresh_after_diagnostics_and_previous_calls(monkeypatch, keys, boundary):
    private, public = keys
    real_decode = jwt.decode
    seen = []

    def recording_decode(*args, **kwargs):
        options = kwargs["options"]
        assert all(options is not previous for previous in seen)
        seen.append(options)  # retain objects, so identity cannot be recycled
        try:
            return real_decode(*args, **kwargs)
        finally:
            # Model the vulnerable dependency writing into its caller's mapping.
            options.update(verify_signature=False, verify_exp=False, verify_aud=False,
                           verify_iss=False, verify_nbf=False, verify_iat=False)

    monkeypatch.setattr(jwt, "decode", recording_decode)
    wrong = {**_claims(), "aud": "other-app"}
    assert _verify(boundary, jwt.encode(wrong, private, algorithm="RS256"), public) is None
    assert _verify(boundary, jwt.encode(_claims(), private, algorithm="RS256"), public)
    expired = {**_claims(), "exp": 1}
    assert _verify(boundary, jwt.encode(expired, private, algorithm="RS256"), public) is None


@pytest.mark.parametrize("method", ["decode", "decode_complete"])
def test_pinned_pyjwt_preserves_options_across_verification_modes(keys, method):
    """Behavior evidence, not a claim that the advisory advertises a fix."""
    private, public = keys
    token = jwt.encode({**_claims(), "exp": 1}, private, algorithm="RS256")
    options = {"verify_signature": False}
    decode = getattr(jwt, method)
    decode(token, options=options)
    assert options == {"verify_signature": False}
    options["verify_signature"] = True
    with pytest.raises(jwt.ExpiredSignatureError):
        decode(token, public, algorithms=["RS256"], audience="hermes-test", options=options)


@pytest.mark.asyncio
async def test_teams_sdk_uses_fresh_options_after_unverified_decode(monkeypatch, keys, tmp_path):
    monkeypatch.chdir(tmp_path)  # SDK find_dotenv must never walk the checkout's real home.
    (tmp_path / ".env").write_text("# isolated SDK import fixture\n")
    pytest.importorskip("microsoft_teams")
    from plugins.platforms.teams.adapter import _suppress_third_party_dotenv
    with _suppress_third_party_dotenv():
        from microsoft_teams.apps.auth.token_validator import TokenValidator, JwtValidationOptions
    private, public = keys
    validator = TokenValidator(JwtValidationOptions(
        valid_issuers=["https://issuer.example"], valid_audiences=["hermes-test"],
        jwks_uri="https://issuer.example/jwks"))
    validator._jwks_client = SimpleNamespace(
        get_signing_key_from_jwt=lambda _: SimpleNamespace(key=public))
    real_decode = jwt.decode
    seen = []

    def recording_decode(*args, **kwargs):
        options = kwargs["options"]
        assert all(options is not previous for previous in seen)
        seen.append(options)
        try:
            return real_decode(*args, **kwargs)
        finally:
            options.update(verify_signature=False, verify_exp=False, verify_aud=False, verify_iss=False)

    monkeypatch.setattr(jwt, "decode", recording_decode)
    token = jwt.encode(_claims(), private, algorithm="RS256")
    jwt.decode(token, options={"verify_signature": False})
    assert await validator.validate_token(token)
    for claims in ({**_claims(), "exp": 1}, {**_claims(), "aud": "other-app"},
                   {**_claims(), "iss": "https://other.example"}):
        with pytest.raises(jwt.InvalidTokenError):
            await validator.validate_token(jwt.encode(claims, private, algorithm="RS256"))
