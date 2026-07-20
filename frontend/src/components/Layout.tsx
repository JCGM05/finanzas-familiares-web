import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { APP_EMOJI } from '../lib/appConfig'
import MonthSelector from './MonthSelector'

const tabs = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/mensual', label: 'Panel mensual' },
  { to: '/anual', label: 'Panel anual' },
  { to: '/movimientos', label: 'Movimientos' },
  { to: '/efectivo', label: 'Efectivo' },
  { to: '/importar', label: 'Importar' },
  { to: '/objetivos', label: 'Objetivos' },
  { to: '/patrimonio', label: 'Patrimonio' },
  { to: '/configuracion', label: 'Configuración' },
]

function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      onClick={toggle}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="relative flex h-8 w-14 items-center rounded-full bg-slate-200 px-1 transition-colors dark:bg-slate-700"
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow transition-transform dark:bg-slate-900 ${
          dark ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        {dark ? '🌙' : '☀️'}
      </span>
    </button>
  )
}

function ExitButton() {
  const { logout } = useAuth()
  return (
    <button
      onClick={logout}
      className="flex items-center gap-1.5 rounded-lg bg-salmon-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-salmon-500"
      title="Cerrar sesión"
    >
      <span aria-hidden>⎋</span> Salir
    </button>
  )
}

export default function Layout() {
  const { appName, user } = useAuth()
  const [menuAbierto, setMenuAbierto] = useState(false)

  const navLinks = (onClick?: () => void) =>
    tabs.map((t) => (
      <NavLink
        key={t.to}
        to={t.to}
        end={t.end}
        onClick={onClick}
        className={({ isActive }) =>
          `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            isActive
              ? 'bg-verde-100 text-verde-700 dark:bg-verde-600 dark:text-white'
              : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
          }`
        }
      >
        {t.label}
      </NavLink>
    ))

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          {/* Marca */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{APP_EMOJI}</span>
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{appName}</span>
          </div>

          {/* Navegación de escritorio */}
          <nav className="hidden flex-wrap gap-1 lg:flex">{navLinks()}</nav>

          {/* Controles derecha */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><MonthSelector /></div>
            <ThemeToggle />
            <div className="hidden sm:block"><ExitButton /></div>
            {/* Hamburguesa (móvil/tablet) */}
            <button
              onClick={() => setMenuAbierto((v) => !v)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
              aria-label="Menú"
            >
              <span className="block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
              <span className="mt-1 block h-0.5 w-5 bg-current" />
            </button>
          </div>
        </div>

        {/* Menú desplegable móvil */}
        {menuAbierto && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 sm:hidden"><MonthSelector /></div>
            <nav className="flex flex-col gap-1">{navLinks(() => setMenuAbierto(false))}</nav>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
              <span className="text-sm text-slate-500 dark:text-slate-400">{user?.display_name}</span>
              <ExitButton />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
