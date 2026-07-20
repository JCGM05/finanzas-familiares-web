import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { APP_EMOJI } from '../lib/appConfig'
import { api } from '../lib/api'

type Step = 'login' | 'setup' | 'verify' | 'codes'
const MFA_SEGUNDOS = 90

export default function Login() {
  const { appName, loginWithToken } = useAuth()
  const [step, setStep] = useState<Step>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [tempToken, setTempToken] = useState('')
  const [code, setCode] = useState('')
  const [usarRecovery, setUsarRecovery] = useState(false)
  const [qr, setQr] = useState<{ qr_data_uri: string; secret: string } | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [pendingToken, setPendingToken] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [restante, setRestante] = useState(MFA_SEGUNDOS)
  const enMfa = step === 'setup' || step === 'verify'

  // Cuenta atrás del paso de MFA: si llega a 0, el token temporal caduca y se vuelve al login.
  const restanteRef = useRef(restante)
  restanteRef.current = restante
  useEffect(() => {
    if (!enMfa) return
    const id = setInterval(() => {
      if (restanteRef.current <= 1) {
        clearInterval(id)
        volverAlLogin('⏱ Se acabó el tiempo para el MFA. Vuelve a entrar.')
      } else {
        setRestante((s) => s - 1)
      }
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enMfa])

  function volverAlLogin(mensaje: string) {
    setStep('login'); setCode(''); setPassword(''); setUsarRecovery(false)
    setQr(null); setTempToken(''); setErr(mensaje)
  }

  const input = 'w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2.5 text-sm focus:border-verde-500 focus:outline-none focus:ring-2 focus:ring-verde-100'
  const boton = 'w-full rounded-lg bg-verde-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50'
  const clean = (m: unknown) => (m instanceof Error ? m.message.replace(/^\d+:\s*/, '') : String(m))

  async function doLogin(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      const r = await api.login(username, password)
      // Cuenta de rescate: sin MFA, el backend ya entrega el token de acceso.
      if (r.status === 'ok' && r.access_token) {
        await loginWithToken(r.access_token)
        return
      }
      setTempToken(r.temp_token)
      setRestante(MFA_SEGUNDOS)   // arranca la cuenta atrás del MFA
      if (r.status === 'mfa_setup_required') {
        const s = await api.mfaSetup(r.temp_token)
        setQr({ qr_data_uri: s.qr_data_uri, secret: s.secret })
        setStep('setup')
      } else {
        setStep('verify')
      }
    } catch (e2) {
      setErr(clean(e2))
    } finally {
      setBusy(false)
    }
  }

  async function doVerify(e: React.FormEvent) {
    e.preventDefault()
    setErr(null); setBusy(true)
    try {
      if (step === 'setup') {
        const r = await api.mfaVerifySetup(tempToken, code)
        // Mostrar los códigos de recuperación antes de entrar
        setRecoveryCodes(r.recovery_codes)
        setPendingToken(r.access_token)
        setStep('codes')
      } else if (usarRecovery) {
        const r = await api.mfaRecovery(tempToken, code)
        await loginWithToken(r.access_token)
      } else {
        const r = await api.mfaVerify(tempToken, code)
        await loginWithToken(r.access_token)
      }
    } catch (e2) {
      const raw = e2 instanceof Error ? e2.message : String(e2)
      // token caducado o cuenta bloqueada -> volver al login; código incorrecto -> mostrar y seguir
      if (/^429|caducad|inválid|invalid|bloquead/i.test(raw)) {
        volverAlLogin(clean(raw))
      } else {
        setErr(clean(raw))
        setCode('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-verde-50 dark:from-slate-800 to-slate-100 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-4xl">{APP_EMOJI}</div>
          <h1 className="mt-2 text-xl font-bold text-slate-800 dark:text-slate-100">{appName}</h1>
        </div>

        {err && <div className="mb-4 rounded-lg bg-salmon-50 dark:bg-salmon-500/15 px-3 py-2 text-sm text-salmon-600">{err}</div>}

        {enMfa && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Tiempo para introducir el código</span>
              <span className={restante <= 15 ? 'font-semibold text-salmon-600' : ''}>{restante}s</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${restante <= 15 ? 'bg-salmon-500' : 'bg-verde-500'}`}
                style={{ width: `${(restante / MFA_SEGUNDOS) * 100}%` }}
              />
            </div>
          </div>
        )}

        {step === 'login' && (
          <form onSubmit={doLogin} className="space-y-3">
            <input className={input} placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
            <input className={input} type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <button className={boton} disabled={busy}>{busy ? '…' : 'Entrar'}</button>
          </form>
        )}

        {step === 'setup' && qr && (
          <form onSubmit={doVerify} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Configura el segundo factor: escanea este QR con <b>Authy</b> o <b>Microsoft Authenticator</b> y escribe el código de 6 dígitos.</p>
            <img src={qr.qr_data_uri} alt="QR MFA" className="mx-auto h-44 w-44 rounded-lg border border-slate-200 dark:border-slate-700" />
            <p className="break-all text-center text-xs text-slate-400 dark:text-slate-500">o clave manual: <code>{qr.secret}</code></p>
            <input className={`${input} text-center tracking-widest`} placeholder="000000" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            <button className={boton} disabled={busy}>{busy ? '…' : 'Activar y entrar'}</button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={doVerify} className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {usarRecovery
                ? 'Introduce uno de tus códigos de recuperación (formato ABCD-2345).'
                : 'Introduce el código de 6 dígitos de tu app de autenticación.'}
            </p>
            <input
              className={`${input} text-center tracking-widest`}
              placeholder={usarRecovery ? 'ABCD-2345' : '000000'}
              inputMode={usarRecovery ? 'text' : 'numeric'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
            <button className={boton} disabled={busy}>{busy ? '…' : 'Verificar'}</button>
            <button
              type="button"
              onClick={() => { setUsarRecovery(!usarRecovery); setCode(''); setErr(null) }}
              className="w-full text-center text-xs text-slate-400 dark:text-slate-500 hover:text-slate-700"
            >
              {usarRecovery ? '← Usar el código de la app' : '¿Perdiste el móvil? Usar un código de recuperación'}
            </button>
          </form>
        )}

        {step === 'codes' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              ✅ MFA activado. <b>Guarda estos códigos de recuperación</b> en un sitio seguro: te permitirán entrar si pierdes el móvil. Cada uno se usa una sola vez.
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 font-mono text-sm">
              {recoveryCodes.map((c) => <span key={c} className="text-center text-slate-700 dark:text-slate-200">{c}</span>)}
            </div>
            <button className={boton} onClick={() => loginWithToken(pendingToken)}>Los he guardado, entrar</button>
          </div>
        )}
      </div>
    </div>
  )
}
