import { useState } from 'react'
import { Card, ErrorBox, Loading } from '../components/ui'
import { usePeriod } from '../context/PeriodContext'
import { api } from '../lib/api'
import { fmtEur, fmtFecha, MESES } from '../lib/format'
import type { NewTransaction, PagadoCon, TipoMovimiento, Transaction } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const TIPOS: { v: TipoMovimiento; label: string }[] = [
  { v: 'gasto', label: 'Gasto' },
  { v: 'ingreso_nomina', label: 'Ingreso nómina' },
  { v: 'ingreso_extra', label: 'Ingreso extra' },
]
const FONDOS: { v: PagadoCon; label: string }[] = [
  { v: 'cuenta_comun', label: '🏦 Cuenta común' },
  { v: 'efectivo', label: '💵 Efectivo' },
]
const hoyISO = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): NewTransaction => ({
  fecha: hoyISO(),
  tipo: 'gasto',
  category_id: 0,
  descripcion: '',
  importe: '',
  pagado_con: 'cuenta_comun',
})

export default function Movimientos() {
  const { anio, mes } = usePeriod()
  const [filtroFondo, setFiltroFondo] = useState<'' | PagadoCon>('')
  const cats = useAsync(() => api.categories(), [])
  const txs = useAsync(
    () => api.transactions({ anio, mes, pagado_con: filtroFondo || undefined }),
    [anio, mes, filtroFondo],
  )
  const [form, setForm] = useState<NewTransaction>(emptyForm())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const categorias = cats.data ?? []
  const editando = editingId !== null

  function cargarEnFormulario(t: Transaction) {
    setEditingId(t.id)
    setForm({
      fecha: t.fecha,
      tipo: t.tipo,
      category_id: t.category_id,
      descripcion: t.descripcion ?? '',
      importe: t.importe,
      pagado_con: t.pagado_con,
    })
    setFormError(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelar() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!form.category_id) return setFormError('Elige una categoría')
    if (!form.importe || Number(form.importe) <= 0) return setFormError('El importe debe ser mayor que 0')
    setSaving(true)
    try {
      const payload = { ...form, importe: Number(form.importe) }
      if (editando) await api.updateTransaction(editingId!, payload)
      else await api.createTransaction(payload)
      cancelar()
      txs.reload()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function borrar(id: number) {
    if (!confirm('¿Borrar este movimiento?')) return
    await api.deleteTransaction(id)
    if (editingId === id) cancelar()
    txs.reload()
  }

  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-verde-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
        Movimientos · <span className="text-verde-600">{MESES[mes - 1]} {anio}</span>
      </h1>

      {/* Alta / edición de movimiento */}
      <Card className={editando ? 'ring-2 ring-verde-400' : ''}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {editando ? '✏️ Editar movimiento' : '➕ Nuevo movimiento'}
          </h2>
          {editando && (
            <button onClick={cancelar} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700">
              Cancelar edición
            </button>
          )}
        </div>
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
            <input type="text" placeholder="Descripción" value={form.descripcion ?? ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className={inputCls} />
            <input type="number" step="0.01" placeholder="Importe €" value={form.importe} onChange={(e) => setForm({ ...form, importe: e.target.value })} className={inputCls} />
            <select value={form.pagado_con} onChange={(e) => setForm({ ...form, pagado_con: e.target.value as PagadoCon })} className={inputCls} title="Fondo">
              {FONDOS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
            </select>
          </div>
          {/* Botón en su propia línea, destacado y bien separado de los campos */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            {formError ? <p className="text-sm text-salmon-600">{formError}</p> : <span />}
            <button type="submit" disabled={saving} className="rounded-lg bg-verde-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-verde-700 disabled:opacity-50">
              {saving ? '…' : editando ? '💾 Guardar cambios' : '➕ Añadir movimiento'}
            </button>
          </div>
        </form>
      </Card>

      {/* Filtro por fondo */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: '', label: 'Todos' },
          { v: 'cuenta_comun', label: '🏦 Cuenta común' },
          { v: 'efectivo', label: '💵 Efectivo' },
        ].map((f) => (
          <button
            key={f.v}
            onClick={() => setFiltroFondo(f.v as '' | PagadoCon)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              filtroFondo === f.v
                ? 'bg-verde-600 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Listado */}
      {txs.loading ? (
        <Loading />
      ) : txs.error ? (
        <ErrorBox msg={txs.error} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <th className="py-2 pr-2">Fecha</th>
                <th className="py-2 px-2">Fondo</th>
                <th className="py-2 px-2">Tipo</th>
                <th className="py-2 px-2">Categoría</th>
                <th className="py-2 px-2">Descripción</th>
                <th className="py-2 px-2 text-right">Importe</th>
                <th className="py-2 pl-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(txs.data ?? []).map((t) => {
                const ingreso = t.tipo !== 'gasto'
                return (
                  <tr key={t.id} className={`border-b border-slate-100 dark:border-slate-800 last:border-0 ${editingId === t.id ? 'bg-verde-50 dark:bg-verde-500/15' : ''}`}>
                    <td className="py-2 pr-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(t.fecha)}</td>
                    <td className="py-2 px-2">
                      {t.pagado_con === 'efectivo'
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">💵 Efectivo</span>
                        : <span className="text-xs text-slate-400 dark:text-slate-500">🏦 Común</span>}
                    </td>
                    <td className="py-2 px-2"><span className={ingreso ? 'text-verde-600' : 'text-slate-600 dark:text-slate-300'}>{ingreso ? 'Ingreso' : 'Gasto'}</span></td>
                    <td className="py-2 px-2 text-slate-700 dark:text-slate-200">{t.categoria_nombre}</td>
                    <td className="py-2 px-2 text-slate-500 dark:text-slate-400">{t.descripcion}</td>
                    <td className={`py-2 px-2 text-right font-semibold ${ingreso ? 'text-verde-600' : 'text-slate-800 dark:text-slate-100'}`}>
                      {ingreso ? '+' : '−'}{fmtEur(t.importe)}
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => cargarEnFormulario(t)}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-verde-700"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => borrar(t.id)}
                          className="rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-salmon-50 hover:text-salmon-600"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {(txs.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500">Sin movimientos en {MESES[mes - 1]} de {anio}.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
