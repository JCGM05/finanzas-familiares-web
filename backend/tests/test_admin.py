"""Tests de la cuenta de rescate (break-glass) y su panel de administración.

Todo corre sobre la BD SQLite en memoria del fixture `db` (conftest): NO se
toca ninguna base de datos real del usuario.
"""

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app import models, security
from app.deps import get_admin_user, get_finanzas_user
from app.routers import admin, auth
from app.schemas import AdminConfirm, AdminResetPassword, LoginRequest

ADMIN_PWD = "RescateSuperSegura#2026"


def _crear_admin(db) -> models.User:
    a = models.User(
        email="recovery@local",
        username="recovery",
        display_name="Cuenta de rescate",
        password_hash=security.hash_password(ADMIN_PWD),
        is_admin=True,
    )
    db.add(a)
    db.commit()
    return a


def _julio(db) -> models.User:
    return db.query(models.User).filter(models.User.username == "julio").first()


# ---------- Dependencias de rol ----------
def test_admin_dep_rechaza_usuario_normal(db):
    normal = _julio(db)
    with pytest.raises(HTTPException) as e:
        get_admin_user(normal)
    assert e.value.status_code == 403


def test_finanzas_dep_rechaza_admin(db):
    admin_user = _crear_admin(db)
    with pytest.raises(HTTPException) as e:
        get_finanzas_user(admin_user)
    assert e.value.status_code == 403


# ---------- Login: el admin entra sin MFA ----------
def test_login_admin_devuelve_access_token_directo(db):
    _crear_admin(db)
    r = auth.login(LoginRequest(username="recovery", password=ADMIN_PWD), db)
    assert r.status == "ok"
    assert r.access_token and not r.temp_token
    # el token es de acceso completo (scope 'access')
    assert security.decode_token(r.access_token)["scope"] == "access"


def test_login_usuario_normal_sigue_pidiendo_mfa(db):
    # julio del seed tiene password_hash="x"; le ponemos una real para este test
    julio = _julio(db)
    julio.password_hash = security.hash_password("clave-julio")
    db.commit()
    r = auth.login(LoginRequest(username="julio", password="clave-julio"), db)
    assert r.status in ("mfa_required", "mfa_setup_required")
    assert r.temp_token and not r.access_token


# ---------- Listado ----------
def test_list_users_excluye_admin(db):
    admin_user = _crear_admin(db)
    fichas = admin.list_users(db, admin_user)
    nombres = {f.username for f in fichas}
    assert "julio" in nombres and "yanay" in nombres
    assert "recovery" not in nombres


def test_list_users_marca_bloqueado(db):
    admin_user = _crear_admin(db)
    julio = _julio(db)
    julio.locked_until = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    ficha = next(f for f in admin.list_users(db, admin_user) if f.username == "julio")
    assert ficha.bloqueado is True


# ---------- Reset de contraseña ----------
def test_reset_password_pone_temporal_y_fuerza_cambio(db):
    admin_user = _crear_admin(db)
    julio = _julio(db)
    julio.locked_until = datetime.utcnow() + timedelta(minutes=10)
    db.commit()

    admin.reset_password(
        julio.id, AdminResetPassword(admin_password=ADMIN_PWD, new_password="Temporal99"), db, admin_user
    )
    db.refresh(julio)
    assert security.verify_password("Temporal99", julio.password_hash)
    assert julio.must_change_password is True
    assert julio.locked_until is None  # de paso lo desbloquea


def test_reset_password_con_admin_password_incorrecta_falla(db):
    admin_user = _crear_admin(db)
    julio = _julio(db)
    hash_previo = julio.password_hash
    with pytest.raises(HTTPException) as e:
        admin.reset_password(
            julio.id, AdminResetPassword(admin_password="mal", new_password="Temporal99"), db, admin_user
        )
    assert e.value.status_code == 401
    db.refresh(julio)
    assert julio.password_hash == hash_previo  # no se tocó


def test_reset_password_corta_rechazada(db):
    admin_user = _crear_admin(db)
    julio = _julio(db)
    with pytest.raises(HTTPException) as e:
        admin.reset_password(
            julio.id, AdminResetPassword(admin_password=ADMIN_PWD, new_password="123"), db, admin_user
        )
    assert e.value.status_code == 422


# ---------- Reset de MFA ----------
def test_reset_mfa_desactiva_y_borra_recovery(db):
    admin_user = _crear_admin(db)
    julio = _julio(db)
    julio.mfa_enabled = True
    julio.totp_secret = security.new_totp_secret()
    db.add(models.RecoveryCode(user_id=julio.id, code_hash="h1"))
    db.add(models.RecoveryCode(user_id=julio.id, code_hash="h2"))
    db.commit()

    admin.reset_mfa(julio.id, AdminConfirm(admin_password=ADMIN_PWD), db, admin_user)
    db.refresh(julio)
    assert julio.mfa_enabled is False
    assert julio.totp_secret is None
    restantes = db.query(models.RecoveryCode).filter(models.RecoveryCode.user_id == julio.id).count()
    assert restantes == 0


# ---------- No se puede administrar a otra cuenta admin ----------
def test_no_se_puede_resetear_a_una_cuenta_admin(db):
    admin_user = _crear_admin(db)
    otro_admin = models.User(
        email="a2@local", username="rescate2", display_name="Rescate 2",
        password_hash=security.hash_password("x"), is_admin=True,
    )
    db.add(otro_admin)
    db.commit()
    with pytest.raises(HTTPException) as e:
        admin.reset_password(
            otro_admin.id, AdminResetPassword(admin_password=ADMIN_PWD, new_password="Temporal99"), db, admin_user
        )
    assert e.value.status_code == 400


# ---------- Desbloqueo ----------
def test_unlock_levanta_el_bloqueo(db):
    admin_user = _crear_admin(db)
    julio = _julio(db)
    julio.locked_until = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    admin.unlock(julio.id, AdminConfirm(admin_password=ADMIN_PWD), db, admin_user)
    db.refresh(julio)
    assert julio.locked_until is None
