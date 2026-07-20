from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.deps import get_finanzas_user
from app.models import Base
from app.routers import (
    admin,
    auth,
    categories,
    config,
    dashboard,
    goals,
    importer,
    networth,
    settings as settings_router,
    transactions,
)

# En despliegue real, la creación de tablas la hará Alembic o el script de migración.
# Aquí garantizamos que existan al arrancar en desarrollo.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Finanzas Familiares API", version="0.1.0")

# Orígenes configurables por entorno (CORS_ORIGINS). En dev, localhost:5173.
# En producción, detrás de NGINX Proxy Manager, frontend y backend comparten
# dominio, así que se pone ese dominio HTTPS. La terminación TLS (443) la hace
# el proxy: la app siempre habla HTTP puertas adentro.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Abiertos (sin JWT): login/MFA y el nombre público de la app para la pantalla de acceso.
app.include_router(auth.router)
app.include_router(settings_router.router)

# Administración: solo la cuenta de rescate (is_admin). Protegido dentro del router.
app.include_router(admin.router)

# Finanzas: requieren un usuario NORMAL autenticado. La cuenta de rescate queda
# fuera (get_finanzas_user la rechaza), de modo que solo administra cuentas.
protegido = [Depends(get_finanzas_user)]
app.include_router(categories.router, dependencies=protegido)
app.include_router(transactions.router, dependencies=protegido)
app.include_router(goals.router, dependencies=protegido)
app.include_router(networth.router, dependencies=protegido)
app.include_router(config.router, dependencies=protegido)
app.include_router(dashboard.router, dependencies=protegido)
app.include_router(importer.router, dependencies=protegido)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
