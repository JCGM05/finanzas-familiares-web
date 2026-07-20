"""
Crea (o actualiza) la cuenta de RESCATE ("break-glass").

Esta cuenta:
- entra SOLO con contraseña (exenta del MFA obligatorio), para que siempre
  quede una vía de recuperar los accesos de julio/yanay;
- NO accede a las finanzas, solo al panel de administración;
- puede resetear la contraseña y el MFA de los usuarios normales.

Uso:
    python scripts/create_admin.py [usuario] [contraseña]

- Si omites la contraseña, se genera una robusta y se muestra UNA vez.
- La cuenta arranca con `must_change_password=True`: en el primer acceso se
  te pedirá ponerle tu propia contraseña.
- Idempotente: si la cuenta ya existe, solo cambia la contraseña si pasas una
  nueva explícitamente (no toca nada por defecto).

Ejecuta esto en el mismo entorno que el backend (con las deps instaladas).
"""

import secrets
import sys

sys.path.insert(0, ".")

from sqlalchemy import inspect, text  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.security import hash_password  # noqa: E402

ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"


def generar_password(n: int = 20) -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(n))


def asegurar_columna_is_admin():
    """Añade users.is_admin si falta (SQLite/dev)."""
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("users")}
    if "is_admin" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))
        print("  + columna users.is_admin")


def main():
    username = (sys.argv[1] if len(sys.argv) > 1 else "recovery").strip().lower()
    password = sys.argv[2] if len(sys.argv) > 2 else None
    generada = password is None
    if generada:
        password = generar_password()

    Base.metadata.create_all(bind=engine)
    asegurar_columna_is_admin()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user:
            if not user.is_admin:
                print(f"[!] Ya existe un usuario NORMAL '{username}'. Elige otro nombre para la cuenta de rescate.")
                return
            if len(sys.argv) > 2:  # se pasó contraseña explícita -> se actualiza
                user.password_hash = hash_password(password)
                user.must_change_password = True
                db.commit()
                print(f"[OK] Contraseña de la cuenta de rescate '{username}' actualizada.")
                print(f"     Contraseña temporal: {password}")
            else:
                print(f"La cuenta de rescate '{username}' ya existe. No se cambia nada.")
                print("  Para ponerle una nueva contraseña temporal: python scripts/create_admin.py "
                      f"{username} <nueva_contrasena>")
            return

        user = User(
            email=f"{username}@local",
            username=username,
            display_name="Cuenta de rescate",
            password_hash=hash_password(password),
            mfa_enabled=False,
            must_change_password=True,
            is_admin=True,
        )
        db.add(user)
        db.commit()
        print(f"[OK] Cuenta de rescate creada: usuario '{username}' (solo contrasena, sin MFA).")
        print(f"     Contrasena temporal: {password}")
        print("     En el primer acceso se te pedira cambiarla por la tuya.")
        if generada:
            print("\n     [!] Apunta esta contrasena AHORA: no se volvera a mostrar.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
