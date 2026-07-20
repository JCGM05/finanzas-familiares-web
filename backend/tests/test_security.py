"""Tests de utilidades de seguridad: contraseñas, TOTP y recovery codes."""

import pyotp

from app import security


def test_password_hash_verify():
    h = security.hash_password("MiClave123")
    assert security.verify_password("MiClave123", h)
    assert not security.verify_password("otra", h)


def test_totp_ciclo():
    secret = security.new_totp_secret()
    code = pyotp.TOTP(secret).now()
    assert security.verify_totp(secret, code)
    assert not security.verify_totp(secret, "000000")


def test_jwt_roundtrip():
    tok = security.create_access_token(42)
    payload = security.decode_token(tok)
    assert payload["sub"] == "42"
    assert payload["scope"] == "access"


def test_recovery_codes_formato():
    codes = security.new_recovery_codes(8)
    assert len(codes) == 8
    for c in codes:
        assert len(c) == 9 and c[4] == "-"      # XXXX-XXXX
    # normalización insensible a mayúsculas/espacios
    assert security.normalize_recovery(" abcd-2345 ") == "ABCD-2345"
