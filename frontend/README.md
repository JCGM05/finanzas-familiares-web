# Frontend — Finanzas Familiares

React 19 + Vite + Tailwind CSS 4 + React Router + Recharts.

## Arrancar en local

Necesita el backend corriendo en `http://127.0.0.1:8000` (ver `../backend/README.md`).

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173

- Vite proxya `/api/*` hacia el backend (configurado en `vite.config.ts`), así que
  no hay problemas de CORS en desarrollo.

## Estructura

```
src/
  lib/
    api.ts        Cliente HTTP (fetch) contra el backend
    types.ts      Tipos que reflejan los esquemas del backend
    format.ts     Formato español (1.234,56 € · 12,3 %)
    useAsync.ts   Hook para cargar datos con estado loading/error
  context/
    PeriodContext.tsx   Mes/año seleccionados, compartido por toda la app
  components/
    Layout.tsx    Cabecera con navegación + selector de mes
    MonthSelector.tsx
    ui.tsx        Card, SectionTitle, Bar, Loading, ErrorBox
  pages/
    Inicio.tsx        Dashboard: saldo/colchón, 5 KPIs, donut, 50/30/20
    PanelMensual.tsx  Tabla de categorías con comparativa mes anterior, recibos, gasto personal
    Movimientos.tsx   Listado + alta de movimientos (crear/borrar)
```

## Pendiente (capas siguientes)

- Pantalla de login (cuando el backend tenga JWT).
- Objetivos y Patrimonio (endpoints ya existen en el backend).
- Editar movimiento en línea (el endpoint PATCH ya existe).
- Importación bancaria.
