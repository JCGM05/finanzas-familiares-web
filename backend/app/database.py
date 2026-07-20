import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# En Docker Compose, DATABASE_URL apuntará a Postgres, p.ej.:
#   postgresql+psycopg2://finanzas:contraseña@db:5432/finanzas
# En local, si no se define, usamos SQLite para poder probar sin instalar nada.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./dev_data/finanzas.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
