"""Utilidades de seguridad: hashing de contraseñas, JWT y TOTP."""

import base64
import io
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import pyotp
import qrcode

RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin caracteres ambiguos

# Clave para firmar los JWT. En producción DEBE venir de la variable de entorno
# JWT_SECRET (se define en el .env / docker-compose). En dev hay un valor por
# defecto solo para poder probar sin configurar nada.
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-cambiar-en-produccion")
JWT_ALG = "HS256"
ACCESS_TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "720"))  # 12 h
# Margen para completar el paso de MFA tras la contraseña. Si se agota, hay que
# volver a introducir usuario/contraseña.
TEMP_TOKEN_SECONDS = int(os.environ.get("MFA_TIMEOUT_SECONDS", "90"))

TOTP_ISSUER = "Finanzas Familiares"


# ---------- Contraseñas ----------
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ---------- JWT ----------
def _create_token(sub: str, delta: timedelta, scope: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "scope": scope, "iat": now, "exp": now + delta}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def create_access_token(user_id: int) -> str:
    return _create_token(str(user_id), timedelta(minutes=ACCESS_TOKEN_MINUTES), "access")


def create_temp_token(user_id: int) -> str:
    """Token de corta vida entre la contraseña correcta y el paso de MFA."""
    return _create_token(str(user_id), timedelta(seconds=TEMP_TOKEN_SECONDS), "mfa")


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


# ---------- TOTP ----------
def new_totp_secret() -> str:
    return pyotp.random_base32()


def totp_uri(secret: str, username: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=TOTP_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    # valid_window=1 tolera un pequeño desfase de reloj entre móvil y servidor
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def qr_data_uri(text: str) -> str:
    """Devuelve un PNG del QR como data URI, para mostrarlo con <img>."""
    img = qrcode.make(text)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ---------- Códigos de recuperación (por si se pierde el móvil del MFA) ----------
def new_recovery_codes(n: int = 8) -> list[str]:
    """Genera n códigos legibles tipo 'ABCD-2345'."""
    def one() -> str:
        chars = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(8))
        return f"{chars[:4]}-{chars[4:]}"

    return [one() for _ in range(n)]


def normalize_recovery(code: str) -> str:
    return code.strip().upper().replace(" ", "")
