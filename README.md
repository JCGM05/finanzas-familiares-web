# Finanzas Familiares — App web

App web autoalojada que sustituye la hoja de Excel de finanzas familiares, para
dos usuarios, con los datos sensibles en casa. Migra el Excel a una base de datos
y ofrece dashboard, panel mensual, movimientos, objetivos y patrimonio.

## Stack

- **BD:** PostgreSQL (en dev, SQLite sin instalar nada)
- **Backend:** Python + FastAPI + SQLAlchemy
- **Frontend:** React + Vite + Tailwind CSS
- **Auth:** login propio con JWT *(pendiente)*
- **Empaquetado:** Docker Compose *(pendiente: falta añadir backend y frontend)*
- **Publicación:** NGINX Proxy Manager (SSL wildcard) + WireGuard para acceso remoto

## Arquitectura y modelo de red

La terminación TLS (HTTPS/443) la hace el **NGINX Proxy Manager**; la app habla
HTTP puertas adentro. El objetivo de red es: **solo el frontend es accesible
desde la LAN; backend y base de datos quedan aislados en la red interna de
Docker.**

```
                    ┌─────────────────── LAN ───────────────────┐
  Internet ─443──▶ NGINX Proxy Manager ──┐                       │
                    │  (certificado)      ▼                      │
                    │              frontend  ◀── equipos LAN (navegador)
                    │              nginx: sirve la SPA           │
                    │              + proxya /api ─┐              │
                    └──────────────────────────────┼────────────┘
                                                    ▼ red interna Docker
                                                 backend ──▶ db
                                          (NO en la LAN)   (NO en la LAN)
```

El navegador nunca habla con el backend directamente: el nginx del frontend
sirve la SPA y reenvía `/api/*` al backend (`http://backend:8000`) por la red
interna. Por eso el frontend usa rutas `/api` **relativas** y el mismo código
vale en desarrollo (proxy de Vite) y en producción (proxy de nginx).

### Exposición de cada servicio

| Servicio | ¿Accesible desde la LAN? | Publicación en Docker |
|---|---|---|
| frontend | ✅ Sí (proxy + LAN) | `ports` publicado |
| backend  | ❌ Solo red interna Docker | `expose` (sin `ports`) |
| db       | ❌ Solo red interna Docker | `expose` (+ `127.0.0.1:5432` para admin) |

En **desarrollo** en el PC: el backend se arranca con `--host 127.0.0.1` (solo el
propio equipo). Nunca `--host 0.0.0.0` en la máquina de desarrollo.

## Estado por capas

Plan: datos → backend → frontend → login → importación → Docker.

- [x] **Datos** — modelos SQLAlchemy + migración del Excel (verificada)
- [x] **Backend** — FastAPI: CRUD + dashboard mensual + saldo/colchón (probado)
- [x] **Frontend** — React: Inicio, Panel mensual, Movimientos (verificado en navegador)
- [ ] **Login** — JWT + pantalla de acceso *(siguiente)*
- [ ] **Importación** — pegar extracto del banco y autocategorizar
- [ ] **Docker** — servicios backend + frontend en el compose, con el modelo de red de arriba

## Cómo arrancar en desarrollo

Ver los README de cada parte:
- Backend: [`backend/README.md`](backend/README.md)
- Frontend: [`frontend/README.md`](frontend/README.md)
