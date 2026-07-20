import math
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, security
from app.deps import get_current_user, get_db, get_mfa_user
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MfaCode,
    MfaSetupComplete,
    MfaSetupResponse,
    PasswordConfirm,
    RecoveryCodesOut,
    RecoveryStatus,
    TokenResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _bloqueado(user: models.User, now: datetime) -> int | None:
    """Devuelve minutos restantes de bloqueo, o None si no está bloqueado."""
    if user.locked_until and user.locked_until > now:
        return max(1, math.ceil((user.locked_until - now).total_seconds() / 60))
    return None


def _registrar_intento(db: Session, username: str, ok: bool, kind: str) -> None:
    db.add(models.LoginAttempt(username=username, ok=ok, kind=kind, ts=datetime.utcnow()))
    db.flush()  # autoflush=False: forzamos para que el conteo incluya este intento


def _quizas_bloquear(db: Session, user: models.User, kind: str, max_key: str, default_max: int) -> None:
    """Cuenta los fallos recientes del tipo dado y bloquea la cuenta si superan el máximo."""
    now = datetime.utcnow()
    window = _setting_int(db, "login_window_minutes", 15)
    block = _setting_int(db, "login_block_minutes", 15)
    max_fallos = _setting_int(db, max_key, default_max)
    desde = now - timedelta(minutes=window)
    fallos = (
        db.query(models.LoginAttempt)
        .filter(
            models.LoginAttempt.username == user.username,
            models.LoginAttempt.ok.is_(False),
            models.LoginAttempt.kind == kind,
            models.LoginAttempt.ts >= desde,
        )
        .count()
    )
    if fallos >= max_fallos:
        user.locked_until = now + timedelta(minutes=block)


def _guard_mfa(user: models.User) -> None:
    """Rechaza el paso de MFA si la cuenta está bloqueada."""
    if (mins := _bloqueado(user, datetime.utcnow())) is not None:
        raise HTTPException(429, f"Cuenta bloqueada por demasiados intentos. Prueba en ~{mins} min.")


def _mfa_incorrecto(db: Session, user: models.User, detalle: str = "Código incorrecto") -> None:
    """Registra un fallo de MFA, bloquea si procede y lanza 401."""
    _registrar_intento(db, user.username, False, "mfa")
    _quizas_bloquear(db, user, "mfa", "mfa_max_attempts", 3)
    db.commit()
    if user.locked_until and user.locked_until > datetime.utcnow():
        mins = math.ceil((user.locked_until - datetime.utcnow()).total_seconds() / 60)
        raise HTTPException(429, f"Demasiados códigos incorrectos. Cuenta bloqueada ~{mins} min.")
    raise HTTPException(401, detalle)


def _generar_recovery(db: Session, user: models.User) -> list[str]:
    """Reemplaza los códigos de recuperación del usuario y devuelve los nuevos en claro."""
    db.query(models.RecoveryCode).filter(models.RecoveryCode.user_id == user.id).delete()
    codes = security.new_recovery_codes()
    for c in codes:
        db.add(models.RecoveryCode(user_id=user.id, code_hash=security.hash_password(security.normalize_recovery(c))))
    db.commit()
    return codes


def _setting_int(db: Session, clave: str, default: int) -> int:
    s = db.get(models.Setting, clave)
    try:
        return int(s.valor) if s else default
    except (TypeError, ValueError):
        return default


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    ident = payload.username.strip().lower()
    now = datetime.utcnow()
    user = (
        db.query(models.User)
        .filter((func.lower(models.User.username) == ident) | (func.lower(models.User.email) == ident))
        .first()
    )

    # Bloqueo tipo fail2ban: si la cuenta está bloqueada, no se intenta siquiera.
    if user and (mins := _bloqueado(user, now)) is not None:
        raise HTTPException(429, f"Cuenta bloqueada por demasiados intentos. Prueba en ~{mins} min.")

    ok = bool(user and security.verify_password(payload.password, user.password_hash))
    _registrar_intento(db, ident, ok, "password")

    if not ok:
        if user:
            _quizas_bloquear(db, user, "password", "login_max_attempts", 5)
        db.commit()
        raise HTTPException(401, "Usuario o contraseña incorrectos")

    # Login correcto: se limpia cualquier bloqueo previo.
    if user.locked_until:
        user.locked_until = None
    db.commit()

    # Cuenta de rescate (break-glass): exenta del MFA obligatorio. Entra con
    # solo la contraseña, así siempre queda una vía para recuperar los accesos.
    if user.is_admin:
        return LoginResponse(status="ok", access_token=security.create_access_token(user.id))

    temp = security.create_temp_token(user.id)
    # MFA obligatorio: si aún no lo ha configurado, se le fuerza a hacerlo ahora.
    status = "mfa_required" if user.mfa_enabled else "mfa_setup_required"
    return LoginResponse(status=status, temp_token=temp)


@router.post("/mfa/setup", response_model=MfaSetupResponse)
def mfa_setup(user: models.User = Depends(get_mfa_user), db: Session = Depends(get_db)):
    """Genera (o regenera) un secreto TOTP y devuelve el QR para escanear."""
    if user.mfa_enabled:
        raise HTTPException(409, "El MFA ya está configurado")
    secret = security.new_totp_secret()
    user.totp_secret = secret  # pendiente hasta verificar
    db.commit()
    uri = security.totp_uri(secret, user.username or user.email)
    return MfaSetupResponse(secret=secret, otpauth_uri=uri, qr_data_uri=security.qr_data_uri(uri))


@router.post("/mfa/verify-setup", response_model=MfaSetupComplete)
def mfa_verify_setup(body: MfaCode, user: models.User = Depends(get_mfa_user), db: Session = Depends(get_db)):
    """Confirma el primer código para activar el MFA, genera códigos de recuperación y entra."""
    _guard_mfa(user)
    if not user.totp_secret or not security.verify_totp(user.totp_secret, body.code):
        _mfa_incorrecto(db, user)
    user.mfa_enabled = True
    db.commit()
    codes = _generar_recovery(db, user)
    return MfaSetupComplete(access_token=security.create_access_token(user.id), recovery_codes=codes)


@router.post("/mfa/verify", response_model=TokenResponse)
def mfa_verify(body: MfaCode, user: models.User = Depends(get_mfa_user), db: Session = Depends(get_db)):
    """Verifica el código de un usuario ya enrolado y entra."""
    _guard_mfa(user)
    if not user.mfa_enabled or not security.verify_totp(user.totp_secret, body.code):
        _mfa_incorrecto(db, user)
    return TokenResponse(access_token=security.create_access_token(user.id))


@router.post("/mfa/recovery", response_model=TokenResponse)
def mfa_recovery(body: MfaCode, user: models.User = Depends(get_mfa_user), db: Session = Depends(get_db)):
    """Entra usando un código de recuperación (un solo uso) si se perdió el móvil."""
    _guard_mfa(user)
    objetivo = security.normalize_recovery(body.code)
    for rc in db.query(models.RecoveryCode).filter(
        models.RecoveryCode.user_id == user.id, models.RecoveryCode.used.is_(False)
    ):
        if security.verify_password(objetivo, rc.code_hash):
            rc.used = True
            db.commit()
            return TokenResponse(access_token=security.create_access_token(user.id))
    _mfa_incorrecto(db, user, "Código de recuperación no válido o ya usado")


@router.get("/me", response_model=UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(body: ChangePasswordRequest, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not security.verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "La contraseña actual no es correcta")
    if len(body.new_password) < 6:
        raise HTTPException(422, "La nueva contraseña debe tener al menos 6 caracteres")
    user.password_hash = security.hash_password(body.new_password)
    user.must_change_password = False
    db.commit()


@router.get("/recovery-codes/status", response_model=RecoveryStatus)
def recovery_status(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    remaining = (
        db.query(models.RecoveryCode)
        .filter(models.RecoveryCode.user_id == user.id, models.RecoveryCode.used.is_(False))
        .count()
    )
    return RecoveryStatus(remaining=remaining)


@router.post("/recovery-codes/regenerate", response_model=RecoveryCodesOut)
def regenerate_recovery(body: PasswordConfirm, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Genera un juego nuevo de códigos (invalida los anteriores). Pide la contraseña."""
    if not security.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Contraseña incorrecta")
    return RecoveryCodesOut(recovery_codes=_generar_recovery(db, user))


@router.post("/mfa/reset", status_code=204)
def mfa_reset(body: PasswordConfirm, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Desactiva el MFA (p. ej. para cambiar de móvil). Al ser obligatorio, el
    siguiente acceso obligará a configurarlo de nuevo. Pide la contraseña."""
    if not security.verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Contraseña incorrecta")
    user.mfa_enabled = False
    user.totp_secret = None
    db.query(models.RecoveryCode).filter(models.RecoveryCode.user_id == user.id).delete()
    db.commit()
