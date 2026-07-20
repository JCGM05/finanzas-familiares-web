from collections.abc import Generator

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import models, security
from app.database import SessionLocal

bearer = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user_from_token(
    creds: HTTPAuthorizationCredentials | None, db: Session, scope: str
) -> models.User:
    if creds is None:
        raise HTTPException(401, "No autenticado", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = security.decode_token(creds.credentials)
    except Exception:
        raise HTTPException(401, "Token inválido o caducado")
    if payload.get("scope") != scope:
        raise HTTPException(401, "Token con permisos incorrectos")
    user = db.get(models.User, int(payload["sub"]))
    if not user:
        raise HTTPException(401, "Usuario no encontrado")
    return user


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.User:
    """Usuario autenticado con token de acceso (scope 'access')."""
    return _user_from_token(creds, db, "access")


def get_mfa_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.User:
    """Usuario en el paso intermedio de MFA (scope 'mfa')."""
    return _user_from_token(creds, db, "mfa")


def get_admin_user(user: models.User = Depends(get_current_user)) -> models.User:
    """Solo la cuenta de rescate (is_admin). Protege el panel de administración."""
    if not user.is_admin:
        raise HTTPException(403, "Requiere una cuenta de administración")
    return user


def get_finanzas_user(user: models.User = Depends(get_current_user)) -> models.User:
    """Usuarios normales (NO admin). La cuenta de rescate no accede a las
    finanzas: solo administra las cuentas."""
    if user.is_admin:
        raise HTTPException(403, "La cuenta de rescate no accede a las finanzas")
    return user
