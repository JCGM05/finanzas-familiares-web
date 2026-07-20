import { useState } from 'react'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { usePeriod } from '../context/PeriodContext'
import { api } from '../lib/api'
import { fmtEur, fmtFecha, MESES, num } from '../lib/format'
import type { NewTransaction, TipoMovimiento } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const TIPOS: { v: TipoMovimiento; label: string }[] = [
  { v: 'gasto', label: 'Gasto' },
  { v: 'ingreso_extra', label: 'Ingreso' },
]
const hoyISO = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): NewTransaction => ({
  fecha: hoyISO(),
  tipo: 'gasto',
  category_id: 0,
  descripcion: '',
  importe: '',
  pagado_con: 'efectivo',
})

export default function Efectivo() {
  const { anio, mes } = usePeriod()
  const info = useAsync(() => api.efectivo(anio, mes), [anio, mes])
  const cats = useAsync(() => api.categories(), [])
  const movs = useAsync(() => api.transactions({ anio, mes, pagado_con: 'efectivo' }), [anio, mes])
  const [form, setForm] = useState<NewTransaction>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const categorias = cats.data ?? []
  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-verde-500 focus:outline-none'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.category_id) return setErr('Elige una categoría')
    if (!form.importe || Number(form.importe) <= 0) return setErr('El importe debe ser mayor que 0')
    setSaving(true)
    try {
      await api.createTransaction({ ...form, importe: Number(form.importe), pagado_con: 'efectivo' })
      setForm(emptyForm())
      info.reload(); movs.reload()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSaving(false)
    }
  }

  async function borrar(id: number) {
    if (!confirm('¿Borrar este movimiento de efectivo?')) return
    await api.deleteTransaction(id)
    info.reload(); movs.reload()
  }

  if (info.loading) return <Loading />
  if (info.error) return <ErrorBox msg={info.error} />
  const d = info.data!

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">💵 Efectivo</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Dinero en mano, aparte del banco. No entra en la conciliación bancaria.
        </p>
      </div>

      {/* Saldo + flujo del mes */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-slate-800 dark:to-slate-900 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Saldo en efectivo (caja)</p>
          <p className={`mt-1 text-4xl font-bold ${num(d.saldo_efectivo) < 0 ? 'text-salmon-600' : 'text-amber-600 dark:text-amber-400'}`}>
            {fmtEur(d.saldo_efectivo)}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Acumulado de todo lo recibido menos lo gastado en efectivo.</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Ingresos del mes</p>
          <p className="mt-1 text-2xl font-bold text-verde-600">{fmtEur(d.ingresos_mes)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Gastos del mes</p>
          <p className="mt-1 text-2xl font-bold text-salmon-600">{fmtEur(d.gastos_mes)}</p>
        </Card>
      </div>

      {/* Alta rápida de efectivo */}
      <Card>
        <SectionTitle>Añadir movimiento en efectivo</SectionTitle>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className={inputCls} />
            <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoMovimiento })} className={inputCls}>
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })} className={inputCls}>
              <option value={0}>Categoría…</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <input type="text" placeholder="Descripción (p. ej. salario en efectivo)" value={form.descripcion ?? ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={`${inputCls} md:col-span-2`} />
            <input type="number" step="0.01" placeholder="Importe €" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} className={inputCls} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            {err ? <p className="text-sm text-salmon-600">{err}</p> : <span />}
            <button type="submit" disabled={saving} className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50">
              {saving ? '…' : '💵 Añadir en efectivo'}
            </button>
          </div>
        </form>
      </Card>

      {/* Lista de movimientos de efectivo del mes */}
      <Card className="overflow-x-auto">
        <SectionTitle>Movimientos en efectivo · {MESES[mes - 1]} {anio}</SectionTitle>
        {movs.loading ? (
          <Loading />
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <th className="py-2 pr-2">Fecha</th>
                <th className="py-2 px-2">Tipo</th>
                <th className="py-2 px-2">Categoría</th>
                <th className="py-2 px-2">Descripción</th>
                <th className="py-2 px-2 text-right">Importe</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {(movs.data ?? []).map((t) => {
                const ingreso = t.tipo !== 'gasto'
                return (
                  <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <td className="py-2 pr-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(t.fecha)}</td>
                    <td className="py-2 px-2"><span className={ingreso ? 'text-verde-600' : 'text-slate-600 dark:text-slate-300'}>{ingreso ? 'Ingreso' : 'Gasto'}</span></td>
                    <td className="py-2 px-2 text-slate-700 dark:text-slate-200">{t.categoria_nombre}</td>
                    <td className="py-2 px-2 text-slate-500 dark:text-slate-400">{t.descripcion}</td>
                    <td className={`py-2 px-2 text-right font-semibold ${ingreso ? 'text-verde-600' : 'text-slate-800 dark:text-slate-100'}`}>
                      {ingreso ? '+' : '−'}{fmtEur(t.importe)}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button onClick={() => borrar(t.id)} className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-salmon-50 hover:text-salmon-600">Eliminar</button>
                    </td>
                  </tr>
                )
              })}
              {(movs.data ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 dark:text-slate-500">Sin movimientos en efectivo este mes.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
