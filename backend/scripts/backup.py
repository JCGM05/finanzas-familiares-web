"""
Copia de seguridad de la base de datos. Funciona con SQLite (dev) y Postgres (prod).

Uso:
    python scripts/backup.py [--dir CARPETA] [--keep N]

- SQLite: copia el fichero .db.
- Postgres: usa pg_dump (debe estar en el PATH; en el contenedor de Postgres sí está).
Guarda en CARPETA (por defecto backend/backups/) con marca de tiempo, y conserva
las últimas N copias (por defecto 30).

Para automatizarlo, prográmalo (Programador de tareas de Windows / cron / un
contenedor con cron en Docker). Ejemplo diario recomendado en el despliegue.
"""

import argparse
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, ".")

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./dev_data/finanzas.db")


def rotar(carpeta: Path, keep: int, patron: str):
    copias = sorted(carpeta.glob(patron), key=lambda p: p.stat().st_mtime, reverse=True)
    for viejo in copias[keep:]:
        viejo.unlink()
        print(f"  eliminada copia antigua: {viejo.name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="backups")
    ap.add_argument("--keep", type=int, default=30)
    args = ap.parse_args()

    carpeta = Path(args.dir)
    carpeta.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    if DATABASE_URL.startswith("sqlite"):
        # sqlite:///./dev_data/finanzas.db -> ruta del fichero
        ruta = DATABASE_URL.split("sqlite:///", 1)[1]
        origen = Path(ruta)
        if not origen.exists():
            sys.exit(f"No existe la BD SQLite: {origen}")
        destino = carpeta / f"finanzas_{ts}.db"
        shutil.copy2(origen, destino)
        print(f"Copia SQLite creada: {destino}")
        rotar(carpeta, args.keep, "finanzas_*.db")
    else:
        u = urlparse(DATABASE_URL.replace("postgresql+psycopg2", "postgresql"))
        destino = carpeta / f"finanzas_{ts}.sql"
        env = dict(os.environ)
        if u.password:
            env["PGPASSWORD"] = u.password
        cmd = [
            "pg_dump",
            "-h", u.hostname or "localhost",
            "-p", str(u.port or 5432),
            "-U", u.username or "finanzas",
            "-d", u.path.lstrip("/") or "finanzas",
            "-f", str(destino),
        ]
        print("Ejecutando:", " ".join(cmd))
        subprocess.run(cmd, env=env, check=True)
        print(f"Copia Postgres creada: {destino}")
        rotar(carpeta, args.keep, "finanzas_*.sql")


if __name__ == "__main__":
    main()
