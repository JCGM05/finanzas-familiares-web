"""
Prepara la autenticación sobre una base de datos ya existente:
- crea la tabla settings (y demás nuevas) vía create_all
- añade a 'users' las columnas nuevas si faltan (SQLite)
- asigna username a los usuarios existentes
- pone una contraseña temporal a quien tenga el hash placeholder
- inserta el ajuste app_name

Idempotente: se puede ejecutar varias veces. Uso:
    python scripts/setup_auth.py [contraseña_temporal]
"""

import sys

sys.path.insert(0, ".")

from sqlalchemy import inspect, text  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Base, Setting, User  # noqa: E402
from app.security import hash_password  # noqa: E402

TEMP_PASSWORD = sys.argv[1] if len(sys.argv) > 1 else "Finanzas2026!"


def ensure_columns():
    """Añade columnas nuevas a users si no existen (SQLite)."""
    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("users")}
    alters = {
        "username": "ALTER TABLE users ADD COLUMN username VARCHAR(50)",
        "totp_secret": "ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64)",
        "mfa_enabled": "ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT 0",
        "must_change_password": "ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT 0",
        "locked_until": "ALTER TABLE users ADD COLUMN locked_until DATETIME",
        "is_admin": "ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0",
    }
    with engine.begin() as conn:
        for col, sql in alters.items():
            if col not in cols:
                conn.execute(text(sql))
                print(f"  + columna users.{col}")


def main():
    # Crea tablas nuevas (settings) sin tocar las existentes
    Base.metadata.create_all(bind=engine)
    ensure_columns()

    db = SessionLocal()
    try:
        for u in db.query(User).all():
            if not u.username:
                u.username = u.display_name.strip().lower()
                print(f"  username de {u.display_name} -> {u.username}")
            if u.password_hash and u.password_hash.startswith("CAMBIAR"):
                u.password_hash = hash_password(TEMP_PASSWORD)
                u.must_change_password = True
                print(f"  contraseña temporal para {u.username}")
            if u.mfa_enabled is None:
                u.mfa_enabled = False

        defaults = {
            "app_name": "Finanzas Familiares",
            # fail2ban: máx. intentos fallidos, ventana (min) y bloqueo (min)
            "login_max_attempts": "5",
            "login_window_minutes": "15",
            "login_block_minutes": "15",
            "mfa_max_attempts": "3",
        }
        for clave, valor in defaults.items():
            if not db.get(Setting, clave):
                db.add(Setting(clave=clave, valor=valor))
                print(f"  ajuste {clave} = '{valor}'")

        db.commit()
        print("\nListo. Usuarios:")
        for u in db.query(User).all():
            print(f"  - {u.username}  (mfa_enabled={u.mfa_enabled}, must_change_password={u.must_change_password})")
        print(f"\nContraseña temporal para todos: {TEMP_PASSWORD}")
        print("Cámbiala tras el primer acceso. El MFA (TOTP) es obligatorio: se configura al entrar.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
