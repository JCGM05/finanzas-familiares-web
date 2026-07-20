import { useState } from 'react'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { fmtEur, num } from '../lib/format'
import { useAsync } from '../lib/useAsync'

const inputCls = 'w-full rounded border border-slate-300 dark:border-slate-600 px-2 py-1 text-sm focus:border-verde-500 focus:outline-none'
const TIPO_LABEL: Record<string, string> = {
  recibo_fijo: 'Recibo fijo', variable: 'Variable', anual: 'Anual', puntual: 'Puntual', ingreso: 'Ingreso',
}
const GRUPO_LABEL: Record<string, string> = {
  necesidad: 'Necesidad', deseo: 'Deseo', puntual: 'Puntual', ingreso: 'Ingreso',
}

export default function Configuracion() {
  const summary = useAsync(() => api.configSummary(), [])
  const cats = useAsync(() => api.categories(true), [])
  const annual = useAsync(() => api.annualExpenses(), [])
  const suegros = useAsync(() => api.suegrosConfig(), [])
  const balance = useAsync(() => api.balance().catch(() => null), [])

  if (summary.loading) return <Loading />
  if (summary.error) return <ErrorBox msg={summary.error} />
  const s = summary.data!

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Configuración</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">El centro del sistema: de aquí beben los demás apartados. Edita los campos y guarda.</p>
      </div>

      {/* Ajustes compactos: nombre app · cuenta/MFA · seguridad */}
      <Card>
        <div className="grid gap-4 md:grid-cols-3 md:divide-x md:divide-slate-100 dark:md:divide-slate-800">
          <div className="md:pr-4"><AppNameCard /></div>
          <div className="md:px-4"><CuentaCard /></div>
          <div className="md:pl-4"><SecurityCard /></div>
        </div>
      </Card>

      {/* 1 · Ingresos */}
      <Card className="overflow-x-auto">
        <SectionTitle>1 · Ingresos y aportación a la cuenta común</SectionTitle>
        <IngresosTable ingresos={s.ingresos} onSaved={() => { summary.reload() }} />
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <Kpi label="Ingreso total del hogar (mensual)" value={fmtEur(s.ingreso_total_hogar)} />
          <Kpi label="Disponible cada mes en la común" value={fmtEur(s.disponible_comun_mes)} tone="verde" />
          <Kpi label="Ahorro mensual previsto" value={fmtEur(s.ahorro_mensual_previsto)} tone={num(s.ahorro_mensual_previsto) < 0 ? 'salmon' : 'verde'} />
        </div>
      </Card>

      {/* Saldos */}
      <Card>
        <SectionTitle>Saldos del banco</SectionTitle>
        {balance.loading ? (
          <Loading />
        ) : (
          <SaldoForm key={balance.data?.id ?? 'nuevo'} current={balance.data ?? null} onSaved={() => balance.reload()} />
        )}
      </Card>

      {/* 2 · Categorías y presupuesto */}
      <Card className="overflow-x-auto">
        <SectionTitle>2 · Categorías y presupuesto mensual</SectionTitle>
        <CategoriasTable cats={cats.data ?? []} loading={cats.loading} onChanged={() => { cats.reload(); summary.reload() }} />
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Total presupuestado: <b>{fmtEur(s.total_presupuestado)}</b></span>
          <span className="text-slate-600 dark:text-slate-300">Ahorro mensual previsto:{' '}
            <b className={num(s.ahorro_mensual_previsto) < 0 ? 'text-salmon-600' : 'text-verde-600'}>{fmtEur(s.ahorro_mensual_previsto)}</b>
          </span>
        </div>
      </Card>

      {/* Gastos anuales */}
      <Card className="overflow-x-auto">
        <SectionTitle>Gastos anuales (se provisionan cada mes)</SectionTitle>
        <AnnualTable rows={annual.data ?? []} onChanged={() => annual.reload()} />
      </Card>

      {/* Apoyo suegros */}
      <Card>
        <SectionTitle>Apoyo a los suegros · gasto temporal</SectionTitle>
        <SuegrosBox cfg={suegros.data ?? null} onSaved={() => suegros.reload()} />
      </Card>

      {/* 3 · Listas de desplegables */}
      <Card>
        <SectionTitle>3 · Listas de los desplegables</SectionTitle>
        <div className="grid gap-4 text-sm sm:grid-cols-3">
          <ListBox title="Pagado con" items={['Cuenta común', 'Julio (personal)', 'Yanay (personal)']} />
          <ListBox title="Tipo de movimiento" items={['Gasto', 'Ingreso nómina', 'Ingreso extra']} />
          <ListBox title="Grupo 50/30/20" items={['Necesidad', 'Deseo']} />
        </div>
      </Card>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'verde' | 'salmon' }) {
  const c = tone === 'verde' ? 'text-verde-600' : tone === 'salmon' ? 'text-salmon-600' : 'text-slate-800 dark:text-slate-100'
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
      <p className="text-xs uppercase text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${c}`}>{value}</p>
    </div>
  )
}

function ListBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      <ul className="space-y-1 text-slate-500 dark:text-slate-400">{items.map((i) => <li key={i} className="rounded bg-slate-50 dark:bg-slate-800/60 px-2 py-1">{i}</li>)}</ul>
    </div>
  )
}

// ---- Ingresos editables ----
function IngresosTable({ ingresos, onSaved }: { ingresos: import('../lib/types').IncomeProfileDerived[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<number, { nomina: string; pagas: string; pct: string; meses: string }>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const d = (p: import('../lib/types').IncomeProfileDerived) =>
    draft[p.id] ?? {
      nomina: p.nomina_mensual, pagas: String(p.num_pagas),
      pct: String(Math.round(num(p.pct_a_comun) * 100)), meses: p.meses_pagas_extra ?? '',
    }

  async function guardar(p: import('../lib/types').IncomeProfileDerived) {
    const v = d(p)
    setSavingId(p.id)
    try {
      await api.updateIncomeProfile(p.id, {
        nomina_mensual: Number(v.nomina), num_pagas: Number(v.pagas),
        pct_a_comun: Number(v.pct) / 100, meses_pagas_extra: v.meses,
      })
      onSaved()
    } finally { setSavingId(null) }
  }

  return (
    <table className="w-full min-w-[720px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <th className="py-2 pr-2">Titular</th><th className="py-2 px-2">Nómina</th><th className="py-2 px-2">Nº pagas</th>
          <th className="py-2 px-2">% común</th><th className="py-2 px-2">Meses extra</th>
          <th className="py-2 px-2 text-right">Bruto anual</th><th className="py-2 px-2 text-right">Aporta/mes</th>
          <th className="py-2 pl-2"></th>
        </tr>
      </thead>
      <tbody>
        {ingresos.map((p) => {
          const v = d(p)
          const set = (k: string, val: string) => setDraft((s) => ({ ...s, [p.id]: { ...v, [k]: val } }))
          return (
            <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800">
              <td className="py-2 pr-2 font-medium text-slate-700 dark:text-slate-200">{p.titular}</td>
              <td className="py-2 px-2"><input className={inputCls} value={v.nomina} onChange={(e) => set('nomina', e.target.value)} /></td>
              <td className="py-2 px-2"><input className={inputCls} value={v.pagas} onChange={(e) => set('pagas', e.target.value)} /></td>
              <td className="py-2 px-2"><input className={inputCls} value={v.pct} onChange={(e) => set('pct', e.target.value)} /></td>
              <td className="py-2 px-2"><input className={inputCls} value={v.meses} placeholder="6,12" onChange={(e) => set('meses', e.target.value)} /></td>
              <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">{fmtEur(p.bruto_anual)}</td>
              <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-200">{fmtEur(p.aporta_al_mes)}</td>
              <td className="py-2 pl-2 text-right">
                <button onClick={() => guardar(p)} disabled={savingId === p.id} className="rounded bg-verde-600 px-3 py-1 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
                  {savingId === p.id ? '…' : 'Guardar'}
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---- Saldos ----
function SaldoForm({ current, onSaved }: { current: import('../lib/types').BalanceSnapshotOut | null; onSaved: () => void }) {
  const [total, setTotal] = useState(current?.saldo_total ?? '')
  const [retenido, setRetenido] = useState(current?.saldo_retenido ?? '')
  const [nota, setNota] = useState(current?.nota_retencion ?? '')
  const [fecha, setFecha] = useState(current?.fecha ?? new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    try {
      await fetch('/api/config/balance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saldo_total: Number(total || 0), saldo_retenido: Number(retenido || 0), nota_retencion: nota || null, fecha }),
      })
      onSaved()
    } finally { setSaving(false) }
  }

  const disponible = num(total) - num(retenido)
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <label className="text-sm">Saldo total<input className={inputCls} value={total} onChange={(e) => setTotal(e.target.value)} /></label>
      <label className="text-sm">Retenido<input className={inputCls} value={retenido} onChange={(e) => setRetenido(e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Nota retención<input className={inputCls} value={nota ?? ''} onChange={(e) => setNota(e.target.value)} /></label>
      <label className="text-sm">Fecha<input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      <div className="sm:col-span-5 flex items-center justify-between">
        <span className="text-sm text-slate-600 dark:text-slate-300">Disponible de verdad: <b className="text-verde-600">{fmtEur(disponible)}</b></span>
        <button onClick={guardar} disabled={saving} className="rounded-lg bg-verde-600 px-4 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
          {saving ? '…' : 'Guardar saldo'}
        </button>
      </div>
    </div>
  )
}

// ---- Categorías ----
function CategoriasTable({ cats, loading, onChanged }: { cats: import('../lib/types').Category[]; loading: boolean; onChanged: () => void }) {
  if (loading) return <Loading />
  async function setPresupuesto(id: number, val: string) {
    await api.updateCategory(id, { presupuesto_mensual: Number(val || 0) })
    onChanged()
  }
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <th className="py-2 pr-2">Categoría</th><th className="py-2 px-2">Tipo</th><th className="py-2 px-2">Grupo</th>
          <th className="py-2 px-2">Día</th><th className="py-2 px-2 text-right">Presupuesto</th>
        </tr>
      </thead>
      <tbody>
        {cats.map((c) => (
          <tr key={c.id} className={`border-b border-slate-100 dark:border-slate-800 ${c.es_apoyo_suegros ? 'bg-lila-50 dark:bg-lila-500/20' : ''}`}>
            <td className={`py-1.5 pr-2 font-medium ${c.es_apoyo_suegros ? 'text-lila-600 dark:text-lila-300' : 'text-slate-700 dark:text-slate-200'}`}>{c.nombre}</td>
            <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{TIPO_LABEL[c.tipo]}</td>
            <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{GRUPO_LABEL[c.grupo]}</td>
            <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{c.dia_cargo ?? '—'}</td>
            <td className="py-1.5 px-2 text-right">
              <input
                type="number" step="0.01" defaultValue={c.presupuesto_mensual}
                onBlur={(e) => { if (e.target.value !== c.presupuesto_mensual) setPresupuesto(c.id, e.target.value) }}
                className="w-24 rounded border border-transparent px-1 py-0.5 text-right hover:border-slate-200 focus:border-verde-500 focus:outline-none"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- Gastos anuales ----
function AnnualTable({ rows, onChanged }: { rows: import('../lib/types').AnnualExpense[]; onChanged: () => void }) {
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
          <th className="py-2 pr-2">Concepto</th><th className="py-2 px-2 text-right">Importe anual</th>
          <th className="py-2 px-2">Mes cargo</th><th className="py-2 px-2 text-right">Provisión/mes</th><th className="py-2 px-2">Compañía</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id} className="border-b border-slate-100 dark:border-slate-800">
            <td className="py-1.5 pr-2 font-medium text-slate-700 dark:text-slate-200">{e.concepto}</td>
            <td className="py-1.5 px-2 text-right">
              <input type="number" step="0.01" defaultValue={e.importe_anual}
                onBlur={async (ev) => { if (ev.target.value !== e.importe_anual) { await api.updateAnnualExpense(e.id, { importe_anual: Number(ev.target.value) }); onChanged() } }}
                className="w-24 rounded border border-transparent px-1 py-0.5 text-right hover:border-slate-200 focus:border-verde-500 focus:outline-none" />
            </td>
            <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{e.mes_cargo ?? '—'}</td>
            <td className="py-1.5 px-2 text-right text-slate-500 dark:text-slate-400">{fmtEur(e.provision_mensual)}</td>
            <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{e.compania ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- Suegros ----
function SuegrosBox({ cfg, onSaved }: { cfg: import('../lib/types').SuegrosConfig | null; onSaved: () => void }) {
  const [meses, setMeses] = useState(String(cfg?.meses_previstos ?? 8))
  const [desde, setDesde] = useState(cfg?.fecha_desde ?? new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  async function guardar() {
    setSaving(true)
    try { await api.updateSuegrosConfig({ meses_previstos: Number(meses), fecha_desde: desde }); onSaved() } finally { setSaving(false) }
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Meses previstos<input className={inputCls} value={meses} onChange={(e) => setMeses(e.target.value)} /></label>
        <label className="text-sm">Desde<input type="date" className={inputCls} value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <button onClick={guardar} disabled={saving} className="col-span-2 rounded-lg bg-verde-600 px-4 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
          {saving ? '…' : 'Guardar'}
        </button>
      </div>
      {cfg && (
        <div className="space-y-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
          <Row k="Coste mensual" v={fmtEur(cfg.coste_mensual)} />
          <Row k="Hasta (estimado)" v={cfg.fecha_hasta ?? '—'} />
          <Row k="Coste total previsto" v={fmtEur(cfg.coste_total)} />
          <Row k="Ahorro al terminar" v={fmtEur(cfg.ahorro_al_terminar)} tone="verde" />
        </div>
      )}
    </div>
  )
}

function Row({ k, v, tone }: { k: string; v: string; tone?: 'verde' }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <span className={`font-semibold ${tone === 'verde' ? 'text-verde-600' : 'text-slate-700 dark:text-slate-200'}`}>{v}</span>
    </div>
  )
}

const miniTitle = 'text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500'

// ---- Nombre de la app (compacto) ----
function AppNameCard() {
  const { appName, setAppName } = useAuth()
  const [valor, setValor] = useState(appName)
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)
  async function guardar() {
    setSaving(true); setOk(false)
    try { const r = await api.updateAppName(valor); setAppName(r.app_name); setOk(true) } finally { setSaving(false) }
  }
  return (
    <div>
      <p className={miniTitle}>Nombre de la app</p>
      <div className="mt-2 flex gap-2">
        <input className={inputCls} value={valor} onChange={(e) => { setValor(e.target.value); setOk(false) }} />
        <button onClick={guardar} disabled={saving} className="whitespace-nowrap rounded-lg bg-verde-600 px-3 py-1 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
          {saving ? '…' : 'Guardar'}
        </button>
      </div>
      {ok && <p className="mt-1 text-xs text-verde-600">✓ Actualizado</p>}
    </div>
  )
}

// ---- Tu cuenta (compacto): contraseña + MFA (recovery/reset) ----
function CuentaCard() {
  const { user, refreshUser } = useAuth()
  const [abierto, setAbierto] = useState<null | 'pass' | 'mfa'>(null)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [pwd, setPwd] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const recovery = useAsync(() => api.recoveryStatus().catch(() => ({ remaining: 0 })), [])

  const run = async (fn: () => Promise<void>) => {
    setMsg(null); setBusy(true)
    try { await fn() } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : String(e) }) } finally { setBusy(false) }
  }
  const cambiarPass = () => run(async () => {
    await api.changePassword(actual, nueva); setActual(''); setNueva(''); setMsg({ ok: true, text: '✓ Contraseña cambiada' }); refreshUser()
  })
  const regenerar = () => run(async () => {
    const r = await api.regenerateRecovery(pwd); setCodes(r.recovery_codes); setPwd(''); recovery.reload()
  })
  const resetMfa = () => run(async () => {
    await api.mfaReset(pwd); setPwd(''); setMsg({ ok: true, text: '✓ MFA desactivado. Se configurará de nuevo al volver a entrar.' }); refreshUser()
  })

  return (
    <div className="space-y-2 text-sm">
      <p className={miniTitle}>Tu cuenta</p>
      <div className="text-slate-600 dark:text-slate-300">
        <b>{user?.username}</b> · MFA{' '}
        <span className={user?.mfa_enabled ? 'text-verde-600' : 'text-salmon-600'}>{user?.mfa_enabled ? 'activado ✓' : 'sin configurar'}</span>
        {' · '}<span className="text-slate-400">{recovery.data?.remaining ?? 0} códigos recup.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAbierto(abierto === 'pass' ? null : 'pass')} className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700">Contraseña</button>
        <button onClick={() => setAbierto(abierto === 'mfa' ? null : 'mfa')} className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700">MFA / recuperación</button>
      </div>

      {abierto === 'pass' && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <input className={inputCls} type="password" placeholder="Contraseña actual" value={actual} onChange={(e) => setActual(e.target.value)} />
          <input className={inputCls} type="password" placeholder="Nueva (mín. 6)" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          <button onClick={cambiarPass} disabled={busy} className="rounded bg-verde-600 px-3 py-1 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">Cambiar</button>
        </div>
      )}
      {abierto === 'mfa' && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
          <p className="text-xs text-slate-500 dark:text-slate-400">Confirma tu contraseña para regenerar códigos de recuperación o cambiar de móvil (reset MFA).</p>
          <input className={inputCls} type="password" placeholder="Tu contraseña" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button onClick={regenerar} disabled={busy} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-white dark:border-slate-600">Nuevos códigos</button>
            <button onClick={resetMfa} disabled={busy} className="rounded border border-salmon-500 px-2 py-1 text-xs text-salmon-600 hover:bg-salmon-50">Reset MFA (cambiar móvil)</button>
          </div>
          {codes && (
            <div className="grid grid-cols-2 gap-1 rounded bg-white p-2 font-mono text-xs dark:bg-slate-900">
              {codes.map((c) => <span key={c} className="text-center">{c}</span>)}
              <p className="col-span-2 mt-1 text-center text-[10px] text-slate-400">Guárdalos: cada uno se usa una vez.</p>
            </div>
          )}
        </div>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-verde-600' : 'text-salmon-600'}`}>{msg.text}</p>}
    </div>
  )
}

// ---- Seguridad: límite de intentos de login (fail2ban) ----
function SecurityCard() {
  const sec = useAsync(() => api.getSecurity(), [])
  const [draft, setDraft] = useState<import('../lib/api').SecuritySettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)
  const cur = draft ?? sec.data
  async function guardar() {
    if (!cur) return
    setSaving(true); setOk(false)
    try { const r = await api.updateSecurity(cur); setDraft(r); setOk(true) } finally { setSaving(false) }
  }
  return (
    <div className="space-y-2 text-sm">
      <p className={miniTitle}>Seguridad · bloqueo de acceso</p>
      {!cur ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tras X intentos fallidos en Y minutos, bloquea el acceso Z minutos (estilo fail2ban).</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Máx. intentos contraseña<input className={inputCls} type="number" value={cur.login_max_attempts} onChange={(e) => { setDraft({ ...cur, login_max_attempts: Number(e.target.value) }); setOk(false) }} /></label>
            <label className="text-xs">Máx. intentos MFA<input className={inputCls} type="number" value={cur.mfa_max_attempts} onChange={(e) => { setDraft({ ...cur, mfa_max_attempts: Number(e.target.value) }); setOk(false) }} /></label>
            <label className="text-xs">Ventana min<input className={inputCls} type="number" value={cur.login_window_minutes} onChange={(e) => { setDraft({ ...cur, login_window_minutes: Number(e.target.value) }); setOk(false) }} /></label>
            <label className="text-xs">Bloqueo min<input className={inputCls} type="number" value={cur.login_block_minutes} onChange={(e) => { setDraft({ ...cur, login_block_minutes: Number(e.target.value) }); setOk(false) }} /></label>
          </div>
          <button onClick={guardar} disabled={saving} className="rounded bg-verde-600 px-3 py-1 text-xs font-semibold text-white hover:bg-verde-700 disabled:opacity-50">{saving ? '…' : 'Guardar'}</button>
          {ok && <span className="ml-2 text-xs text-verde-600">✓</span>}
        </>
      )}
    </div>
  )
}
