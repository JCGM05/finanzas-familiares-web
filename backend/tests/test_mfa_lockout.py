"""Test del bloqueo de cuenta tras 3 códigos MFA incorrectos."""

import pytest
from fastapi import HTTPException

from app import models, security
from app.routers import auth
from app.schemas import LoginRequest, MfaCode


def test_bloqueo_tras_3_mfa_fallidos(db):
    u = db.query(models.User).filter_by(username="julio").first()
    u.mfa_enabled = True
    u.totp_secret = security.new_totp_secret()
    u.password_hash = security.hash_password("clave")
    db.commit()

    codigos = []
    for _ in range(3):
        with pytest.raises(HTTPException) as exc:
            auth.mfa_verify(MfaCode(code="000000"), u, db)
        codigos.append(exc.value.status_code)

    # los dos primeros fallos son 401; el tercero bloquea la cuenta -> 429
    assert codigos == [401, 401, 429]
    db.refresh(u)
    assert u.locked_until is not None

    # con la cuenta bloqueada, el propio login (paso de contraseña) también rechaza
    with pytest.raises(HTTPException) as exc2:
        auth.login(LoginRequest(username="julio", password="clave"), db)
    assert exc2.value.status_code == 429


def test_mfa_correcto_no_bloquea(db):
    u = db.query(models.User).filter_by(username="yanay").first()
    secret = security.new_totp_secret()
    u.mfa_enabled = True
    u.totp_secret = secret
    db.commit()
    import pyotp

    # un código correcto entra y no deja la cuenta bloqueada
    resp = auth.mfa_verify(MfaCode(code=pyotp.TOTP(secret).now()), u, db)
    assert resp.access_token
    db.refresh(u)
    assert u.locked_until is None
