import { useState } from 'react'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { APP_EMOJI } from '../lib/appConfig'
import { api } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import type { AdminUser } from '../lib/types'

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 px-3 py-2 text-sm focus:border-verde-500 focus:outline-none'

// Panel exclusivo de la cuenta de rescate (is_admin): recuperar accesos de los
// usuarios normales. No muestra ni toca las finanzas.
export default function AdminPanel() {
  const { appName, user, logout } = useAuth()
  const users = useAsync(() => api.adminUsers(), [])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{APP_EMOJI}</span>
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">{appName}</span>
            <span className="rounded-full bg-lila-100 px-2 py-0.5 text-xs font-semibold text-lila-600 dark:bg-lila-500/20 dark:text-lila-300">
              Administración
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg bg-salmon-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-salmon-500"
              title="Cerrar sesión"
            >
              <span aria-hidden>⎋</span> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Recuperación de accesos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cuenta de rescate <b>{user?.username}</b>. Desde aquí puedes restablecer la contraseña o el segundo
            factor (MFA) de las cuentas de uso diario, y desbloquearlas si se han bloqueado por intentos fallidos.
            Cada acción te pedirá confirmar tu contraseña de administración.
          </p>
        </div>

        {users.loading && <Loading />}
        {users.error && <ErrorBox msg={users.error} />}
        {users.data && users.data.length === 0 && (
          <Card><p className="text-sm text-slate-500 dark:text-slate-400">No hay usuarios que administrar.</p></Card>
        )}
        {users.data?.map((u) => <UserCard key={u.id} u={u} onChanged={() => users.reload()} />)}
      </main>
    </div>
  )
}

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

type Panel = null | 'pass' | 'mfa' | 'unlock'

function UserCard({ u, onChanged }: { u: AdminUser; onChanged: () => void }) {
  const [panel, setPanel] = useState<Panel>(null)
  const [adminPwd, setAdminPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const cerrar = () => { setPanel(null); setAdminPwd(''); setNewPwd(''); setMsg(null) }
  const abrir = (p: Panel) => { if (panel === p) return cerrar(); setPanel(p); setAdminPwd(''); setNewPwd(''); setMsg(null) }

  const run = async (fn: () => Promise<void>, okText: string) => {
    setMsg(null); setBusy(true)
    try {
      await fn()
      setMsg({ ok: true, text: okText })
      setAdminPwd(''); setNewPwd('')
      onChanged()
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const resetPass = () => run(() => api.adminResetPassword(u.id, adminPwd, newPwd), '✓ Contraseña temporal asignada. El usuario deberá cambiarla al entrar.')
  const resetMfa = () => run(() => api.adminResetMfa(u.id, adminPwd), '✓ MFA reseteado. El usuario lo configurará de nuevo al entrar.')
  const desbloquear = () => run(() => api.adminUnlock(u.id, adminPwd), '✓ Cuenta desbloqueada.')

  const btn = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700'

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{u.display_name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">@{u.username}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge on={u.mfa_enabled} onText="MFA activado" offText="MFA sin configurar" />
          {u.bloqueado && <span className="rounded-full bg-salmon-100 px-2 py-0.5 font-semibold text-salmon-600 dark:bg-salmon-500/20">🔒 Bloqueada</span>}
          {u.must_change_password && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 dark:bg-slate-700 dark:text-slate-300">Contraseña temporal</span>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className={btn} onClick={() => abrir('pass')}>Resetear contraseña</button>
        <button className={btn} onClick={() => abrir('mfa')}>Resetear MFA</button>
        {u.bloqueado && (
          <button
            className="rounded-lg border border-salmon-400 px-3 py-1.5 text-xs font-semibold text-salmon-600 hover:bg-salmon-50 dark:hover:bg-salmon-500/10"
            onClick={() => abrir('unlock')}
          >
            Desbloquear
          </button>
        )}
      </div>

      {panel === 'pass' && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
          <SectionTitle>Resetear contraseña de {u.display_name}</SectionTitle>
          <input className={inputCls} type="text" placeholder="Nueva contraseña temporal (mín. 6)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="off" />
          <input className={inputCls} type="password" placeholder="Tu contraseña de administración" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} autoComplete="off" />
          <p className="text-xs text-slate-500 dark:text-slate-400">El usuario entrará con esta contraseña y se le obligará a cambiarla. Comunícasela en persona.</p>
          <div className="flex gap-2">
            <button onClick={resetPass} disabled={busy || !newPwd || !adminPwd} className="rounded-lg bg-verde-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">{busy ? '…' : 'Asignar contraseña temporal'}</button>
            <button onClick={cerrar} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
          </div>
        </div>
      )}

      {panel === 'mfa' && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
          <SectionTitle>Resetear MFA de {u.display_name}</SectionTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">Desactiva su segundo factor (p. ej. cambió o perdió el móvil). Volverá a configurarlo con su app de autenticación en el próximo acceso. No cambia su contraseña.</p>
          <input className={inputCls} type="password" placeholder="Tu contraseña de administración" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <button onClick={resetMfa} disabled={busy || !adminPwd} className="rounded-lg bg-verde-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">{busy ? '…' : 'Resetear MFA'}</button>
            <button onClick={cerrar} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
          </div>
        </div>
      )}

      {panel === 'unlock' && (
        <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
          <SectionTitle>Desbloquear a {u.display_name}</SectionTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">Levanta el bloqueo por intentos fallidos. No cambia su contraseña ni su MFA.</p>
          <input className={inputCls} type="password" placeholder="Tu contraseña de administración" value={adminPwd} onChange={(e) => setAdminPwd(e.target.value)} autoComplete="off" />
          <div className="flex gap-2">
            <button onClick={desbloquear} disabled={busy || !adminPwd} className="rounded-lg bg-verde-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">{busy ? '…' : 'Desbloquear cuenta'}</button>
            <button onClick={cerrar} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancelar</button>
          </div>
        </div>
      )}

      {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-verde-600' : 'text-salmon-600'}`}>{msg.text}</p>}
    </Card>
  )
}

function Badge({ on, onText, offText }: { on: boolean; onText: string; offText: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 font-semibold ${on ? 'bg-verde-100 text-verde-700 dark:bg-verde-600/20 dark:text-verde-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'}`}>
      {on ? onText : offText}
    </span>
  )
}
