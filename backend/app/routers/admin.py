"""Panel de administración de la cuenta de rescate ("break-glass").

Permite a la cuenta is_admin recuperar los accesos de los usuarios normales
(julio, yanay) sin depender de nadie: resetear su contraseña y su MFA, y
desbloquear una cuenta bloqueada por fail2ban. La propia cuenta de rescate
NO aparece aquí (no se administra ni se resetea a sí misma).

Toda acción exige que el admin reconfirme SU contraseña, para que una sesión
abierta y desatendida no pueda usarse para tomar el control de las cuentas.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, security
from app.deps import get_admin_user, get_db
from app.schemas import AdminConfirm, AdminResetPassword, AdminUserOut

router = APIRouter(prefix="/admin", tags=["admin"])


def _confirmar_admin(admin: models.User, password: str) -> None:
    if not security.verify_password(password, admin.password_hash):
        raise HTTPException(401, "Contraseña de administración incorrecta")


def _usuario_normal(db: Session, user_id: int) -> models.User:
    """Devuelve el usuario objetivo, garantizando que NO es una cuenta admin."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "Usuario no encontrado")
    if user.is_admin:
        raise HTTPException(400, "Las cuentas de administración no se gestionan aquí")
    return user


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db), _admin: models.User = Depends(get_admin_user)):
    """Lista los usuarios normales (excluye las cuentas de rescate)."""
    now = datetime.utcnow()
    salida = []
    for u in db.query(models.User).filter(models.User.is_admin.is_(False)).order_by(models.User.id):
        ficha = AdminUserOut.model_validate(u)
        ficha.bloqueado = bool(u.locked_until and u.locked_until > now)
        salida.append(ficha)
    return salida


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: int,
    body: AdminResetPassword,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    """Pone una contraseña temporal al usuario y le obliga a cambiarla al entrar."""
    _confirmar_admin(admin, body.admin_password)
    if len(body.new_password) < 6:
        raise HTTPException(422, "La contraseña temporal debe tener al menos 6 caracteres")
    user = _usuario_normal(db, user_id)
    user.password_hash = security.hash_password(body.new_password)
    user.must_change_password = True
    user.locked_until = None  # de paso, se desbloquea
    db.commit()


@router.post("/users/{user_id}/reset-mfa", status_code=204)
def reset_mfa(
    user_id: int,
    body: AdminConfirm,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    """Desactiva el MFA del usuario (p. ej. cambió de móvil o lo perdió). Como el
    MFA es obligatorio, se le forzará a reconfigurarlo en el próximo acceso."""
    _confirmar_admin(admin, body.admin_password)
    user = _usuario_normal(db, user_id)
    user.mfa_enabled = False
    user.totp_secret = None
    db.query(models.RecoveryCode).filter(models.RecoveryCode.user_id == user.id).delete()
    user.locked_until = None
    db.commit()


@router.post("/users/{user_id}/unlock", status_code=204)
def unlock(
    user_id: int,
    body: AdminConfirm,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_admin_user),
):
    """Levanta el bloqueo fail2ban de una cuenta sin tocar su contraseña ni su MFA."""
    _confirmar_admin(admin, body.admin_password)
    user = _usuario_normal(db, user_id)
    user.locked_until = None
    db.commit()
