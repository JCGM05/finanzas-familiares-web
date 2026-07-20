# Backend — Finanzas Familiares

API en FastAPI + SQLAlchemy. En desarrollo usa SQLite (sin instalar nada); en
producción, Postgres vía `DATABASE_URL`.

## Arrancar en local (desarrollo)

```bash
cd backend
pip install -r requirements.txt

# 1) Migrar los datos del Excel a la base de datos (una sola vez)
python scripts/migrate_from_excel.py "ruta/a/Finanzas Familiares.xlsx"

# 2) Levantar la API (solo accesible desde el propio equipo)
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- Documentación interactiva: http://127.0.0.1:8000/docs
- Base de datos SQLite de desarrollo: `backend/dev_data/finanzas.db`

> **Seguridad — a qué red escucha el backend.** `--host 127.0.0.1` hace que el
> servicio solo acepte conexiones del propio equipo; ningún otro dispositivo de
> la red local puede alcanzarlo. Es también el valor por defecto de uvicorn si
> se omite `--host`. **Nunca uses `--host 0.0.0.0` en tu PC de desarrollo**: eso
> lo expondría a toda la LAN. (En Docker sí se usa `0.0.0.0`, pero sin publicar
> el puerto — ver más abajo.)

## Usar Postgres

Definir `DATABASE_URL` antes de arrancar, p.ej.:

```
DATABASE_URL=postgresql+psycopg2://finanzas:contraseña@db:5432/finanzas
```

El mismo código funciona sin cambios; solo cambia la URL.

## Autenticación (login + MFA obligatorio)

La API está protegida con JWT. Todos los endpoints requieren token salvo
`/auth/*`, `/settings/public` y `/health`.

**Preparar los usuarios** (una vez, sobre la BD ya migrada):

```bash
python scripts/setup_auth.py            # contraseña temporal por defecto: Finanzas2026!
python scripts/setup_auth.py MiClave123 # o define tú la temporal
```

Crea `username` (julio, yanay) y una contraseña temporal, y deja el MFA sin
configurar. **El MFA (TOTP) es obligatorio**: en el primer acceso, la web muestra
un QR para escanear con **Authy** o **Microsoft Authenticator**, y a partir de ahí
pide el código de 6 dígitos. La contraseña temporal se cambia desde
*Configuración → Tu cuenta*.

**Flujo de login (frontend/manual):**
1. `POST /auth/login {username, password}` → `{status, temp_token}`
   (`mfa_setup_required` la primera vez, luego `mfa_required`).
2. Primera vez: `POST /auth/mfa/setup` (Bearer temp_token) → QR; luego
   `POST /auth/mfa/verify-setup {code}` → `{access_token}`.
3. Siguientes: `POST /auth/mfa/verify {code}` (Bearer temp_token) → `{access_token}`.
4. El `access_token` va en `Authorization: Bearer …` en todas las llamadas.

**Variables de entorno de seguridad** (definir en `.env` / docker-compose):

```
JWT_SECRET=<una-cadena-larga-y-aleatoria>   # OBLIGATORIO en producción
ACCESS_TOKEN_MINUTES=720                     # opcional (por defecto 12 h)
```

> **Passkeys / huella (WebAuthn):** pendiente para una fase posterior. La idea
> acordada: si un usuario tiene una passkey registrada, el login pedirá solo la
> huella/Face ID. Requiere el dominio HTTPS final (el del proxy).

## Nombre de la app (marca) editable

Guardado en la tabla `settings` (`app_name`). `GET /settings/public` lo expone sin
autenticación (para la pantalla de login) y `PUT /settings/app-name` lo cambia
(requiere token). Se edita desde *Configuración → Nombre de la aplicación*.

## HTTPS y despliegue detrás de NGINX Proxy Manager

La app **no gestiona TLS ni el puerto 443**: eso lo hace el reverse proxy
(NGINX Proxy Manager) con tu certificado. El proxy descifra el HTTPS y reenvía
la petición a este backend por HTTP en la red interna. Nunca hay que poner un
certificado dentro del contenedor.

Para que la app se comporte bien detrás del proxy hay dos ajustes:

1. **Arrancar uvicorn confiando en las cabeceras del proxy**, para que sepa que
   la conexión real del usuario es HTTPS (`X-Forwarded-Proto`):

   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 \
     --proxy-headers --forwarded-allow-ips="*"
   ```

   (En Docker Compose esto irá en el `command` del servicio backend. Ahí `0.0.0.0`
   es correcto **siempre que no se publique el puerto** — ver el punto 3.)

2. **Fijar el dominio en CORS_ORIGINS** al del proxy:

   ```
   CORS_ORIGINS=https://finanzas.tudominio.com
   ```

   Detrás del proxy, frontend y backend comparten dominio, así que basta ese.

3. **No publicar el puerto del backend en Docker.** El backend debe ser
   alcanzable solo por el frontend/proxy dentro de la red interna de Docker,
   nunca desde la LAN. En `docker-compose.yml`:

   ```yaml
   services:
     backend:
       expose:
         - "8000"        # solo visible dentro de la red Docker
       # ports:          # NO: 'ports' publicaría el 8000 al host y a la LAN
       #   - "8000:8000"
   ```

   `expose` mantiene el puerto interno; `ports` lo publicaría hacia fuera. Para
   este backend queremos `expose`, no `ports`.

> El nginx que sirve el frontend estático, el `docker-compose` completo y las
> cookies seguras del login llegan en la capa de despliegue (Docker + login).

## Endpoints principales

| Método | Ruta | Qué hace |
|---|---|---|
| GET/POST | `/categories` | Listar / crear categorías |
| PATCH/DELETE | `/categories/{id}` | Editar / borrar (desactiva si tiene movimientos) |
| GET/POST | `/transactions` | Listar (filtros anio/mes/categoría) / crear movimiento |
| PATCH/DELETE | `/transactions/{id}` | Editar / borrar movimiento |
| GET/POST | `/goals`, PATCH/DELETE `/goals/{id}` | Objetivos de ahorro |
| GET | `/networth/items`, `/networth/entries?anio=` | Patrimonio |
| PUT | `/networth/entries` | Fijar importe de un concepto en un mes |
| GET | `/config/income`, `/config/balance` | Ingresos y saldo |
| POST | `/config/balance` | Nuevo snapshot de saldo |
| GET | `/dashboard/month?anio=&mes=` | Panel mensual completo (KPIs, categorías, comparativa mes anterior, recibos, gasto personal, 50/30/20) |
| GET | `/dashboard/saldo` | Saldo disponible real y colchón en meses |

## Pendiente (capas siguientes del plan)

- Login propio con JWT (proteger todos los endpoints).
- Endpoint de importación bancaria (match contra movimientos existentes).
- Panel anual (12 meses × categorías).
- Alembic para migraciones de esquema.
