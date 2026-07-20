import os


def _origins_from_env() -> list[str]:
    """
    Orígenes permitidos para CORS.

    - En desarrollo (por defecto): el servidor de Vite en localhost.
    - En producción, detrás de NGINX Proxy Manager, frontend y backend
      comparten dominio (el del proxy), así que basta con poner ese dominio.
      Definir CORS_ORIGINS separado por comas, p.ej.:
        CORS_ORIGINS=https://finanzas.midominio.com
    """
    raw = os.environ.get("CORS_ORIGINS")
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]


class Settings:
    cors_origins: list[str] = _origins_from_env()


settings = Settings()
