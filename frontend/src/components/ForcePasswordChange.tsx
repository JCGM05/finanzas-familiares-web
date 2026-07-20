import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

// Modal bloqueante: si la contraseña es temporal, obliga a cambiarla antes de usar la app.
export default function ForcePasswordChange() {
  const { refreshUser, logout } = useAuth()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-verde-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (nueva.length < 6) return setErr('La nueva contraseña debe tener al menos 6 caracteres')
    if (nueva !== repetir) return setErr('Las contraseñas no coinciden')
    setBusy(true)
    try {
      await api.changePassword(actual, nueva)
      await refreshUser()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message.replace(/^\d+:\s*/, '') : String(e2))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">🔒 Cambia tu contraseña</h2>
        <p className="mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">
          Estás usando una contraseña temporal. Por seguridad, debes cambiarla antes de continuar.
        </p>
        {err && <div className="mb-3 rounded-lg bg-salmon-50 dark:bg-salmon-500/15 px-3 py-2 text-sm text-salmon-600">{err}</div>}
        <form onSubmit={submit} className="space-y-3">
          <input className={input} type="password" placeholder="Contraseña temporal actual" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" autoFocus />
          <input className={input} type="password" placeholder="Nueva contraseña (mín. 6)" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" />
          <input className={input} type="password" placeholder="Repite la nueva contraseña" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" />
          <button disabled={busy} className="w-full rounded-lg bg-verde-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
            {busy ? '…' : 'Guardar y continuar'}
          </button>
          <button type="button" onClick={logout} className="w-full text-center text-xs text-slate-400 hover:text-slate-600">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  )
}
