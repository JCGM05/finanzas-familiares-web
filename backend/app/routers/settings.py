from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.deps import get_current_user, get_db
from app.schemas import AppNameUpdate, AppSettings

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULT_APP_NAME = "Finanzas Familiares"


class SecuritySettings(BaseModel):
    login_max_attempts: int
    login_window_minutes: int
    login_block_minutes: int
    mfa_max_attempts: int


def _get_app_name(db: Session) -> str:
    s = db.get(models.Setting, "app_name")
    return s.valor if s else DEFAULT_APP_NAME


def _set(db: Session, clave: str, valor: str) -> None:
    s = db.get(models.Setting, clave)
    if s:
        s.valor = valor
    else:
        db.add(models.Setting(clave=clave, valor=valor))


def _int(db: Session, clave: str, default: int) -> int:
    s = db.get(models.Setting, clave)
    try:
        return int(s.valor) if s else default
    except (TypeError, ValueError):
        return default


# Público: la pantalla de login necesita el nombre antes de autenticarse.
@router.get("/public", response_model=AppSettings)
def public_settings(db: Session = Depends(get_db)):
    return AppSettings(app_name=_get_app_name(db))


@router.put("/app-name", response_model=AppSettings)
def update_app_name(
    payload: AppNameUpdate,
    db: Session = Depends(get_db),
    _user: models.User = Depends(get_current_user),
):
    nombre = payload.app_name.strip() or DEFAULT_APP_NAME
    _set(db, "app_name", nombre)
    db.commit()
    return AppSettings(app_name=nombre)


def _security_out(db: Session) -> SecuritySettings:
    return SecuritySettings(
        login_max_attempts=_int(db, "login_max_attempts", 5),
        login_window_minutes=_int(db, "login_window_minutes", 15),
        login_block_minutes=_int(db, "login_block_minutes", 15),
        mfa_max_attempts=_int(db, "mfa_max_attempts", 3),
    )


@router.get("/security", response_model=SecuritySettings)
def get_security(db: Session = Depends(get_db), _u: models.User = Depends(get_current_user)):
    return _security_out(db)


@router.put("/security", response_model=SecuritySettings)
def update_security(payload: SecuritySettings, db: Session = Depends(get_db), _u: models.User = Depends(get_current_user)):
    _set(db, "login_max_attempts", str(max(1, payload.login_max_attempts)))
    _set(db, "login_window_minutes", str(max(1, payload.login_window_minutes)))
    _set(db, "login_block_minutes", str(max(1, payload.login_block_minutes)))
    _set(db, "mfa_max_attempts", str(max(1, payload.mfa_max_attempts)))
    db.commit()
    return _security_out(db)
