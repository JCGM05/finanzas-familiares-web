import { useState } from 'react'
import { Card, ErrorBox, Loading, SectionTitle } from '../components/ui'
import { api, type NewGoal } from '../lib/api'
import { fmtEur, fmtPct, num } from '../lib/format'
import type { Goal } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const COLORES = ['#0f766e', '#14b8a6', '#fa8072', '#8b5cf6', '#f59e0b', '#3b82f6', '#ec4899', '#10b981']

const emptyGoal = (): NewGoal => ({ nombre: '', meta: '', ahorrado: '', fecha_objetivo: '' })

export default function Objetivos() {
  const goals = useAsync(() => api.goals(), [])
  const cfg = useAsync(() => api.configSummary(), [])
  const [form, setForm] = useState<NewGoal>(emptyGoal())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (goals.loading) return <Loading />
  if (goals.error) return <ErrorBox msg={goals.error} />
  const lista = goals.data ?? []
  const editando = editingId !== null

  const sumaAportar = lista.reduce((a, g) => a + num(g.aportar_al_mes), 0)
  const ahorroPrevisto = num(cfg.data?.ahorro_mensual_previsto)
  const diferencia = ahorroPrevisto - sumaAportar

  function editar(g: Goal) {
    setEditingId(g.id)
    setForm({ nombre: g.nombre, meta: g.meta, ahorrado: g.ahorrado, fecha_objetivo: g.fecha_objetivo ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function cancelar() {
    setEditingId(null)
    setForm(emptyGoal())
    setErr(null)
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!form.nombre.trim()) return setErr('Pon un nombre')
    if (!form.meta || Number(form.meta) <= 0) return setErr('La meta debe ser mayor que 0')
    setSaving(true)
    try {
      const payload: NewGoal = {
        nombre: form.nombre,
        meta: Number(form.meta),
        ahorrado: Number(form.ahorrado || 0),
        fecha_objetivo: form.fecha_objetivo || null,
      }
      if (editando) await api.updateGoal(editingId!, payload)
      else await api.createGoal(payload)
      cancelar()
      goals.reload()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setSaving(false)
    }
  }
  async function borrar(id: number) {
    if (!confirm('¿Borrar este objetivo?')) return
    await api.deleteGoal(id)
    if (editingId === id) cancelar()
    goals.reload()
  }

  const inputCls = 'rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm focus:border-verde-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Objetivos de ahorro</h1>

      {/* Alta / edición */}
      <Card className={editando ? 'ring-2 ring-verde-400' : ''}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {editando ? '✏️ Editar objetivo' : '➕ Nuevo objetivo'}
          </h2>
          {editando && <button onClick={cancelar} className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-700">Cancelar</button>}
        </div>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-5">
          <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={`${inputCls} md:col-span-2`} />
          <input type="number" step="0.01" placeholder="Meta €" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} className={inputCls} />
          <input type="number" step="0.01" placeholder="Ahorrado €" value={form.ahorrado ?? ''} onChange={(e) => setForm({ ...form, ahorrado: e.target.value })} className={inputCls} />
          <div className="flex gap-2">
            <input type="date" value={form.fecha_objetivo ?? ''} onChange={(e) => setForm({ ...form, fecha_objetivo: e.target.value })} className={`${inputCls} flex-1`} />
            <button type="submit" disabled={saving} className="whitespace-nowrap rounded-lg bg-verde-600 px-4 py-2 text-sm font-semibold text-white hover:bg-verde-700 disabled:opacity-50">
              {saving ? '…' : editando ? 'Guardar' : 'Añadir'}
            </button>
          </div>
        </form>
        {err && <p className="mt-2 text-sm text-salmon-600">{err}</p>}
      </Card>

      {/* Tarjetas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((g, i) => {
          const prog = num(g.progreso)
          const color = COLORES[i % COLORES.length]
          return (
            <Card key={g.id}>
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-md px-2 py-0.5 text-sm font-semibold text-white" style={{ background: color }}>{g.nombre}</span>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => editar(g)} className="text-slate-400 dark:text-slate-500 hover:text-verde-700">Editar</button>
                  <button onClick={() => borrar(g.id)} className="text-slate-400 dark:text-slate-500 hover:text-salmon-600">Eliminar</button>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs uppercase text-slate-400 dark:text-slate-500">Meta</p>
                  <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{fmtEur(g.meta)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-slate-400 dark:text-slate-500">Ahorrado</p>
                  <p className="text-lg font-semibold text-verde-600">{fmtEur(g.ahorrado)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, prog * 100)}%`, background: color }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>{fmtPct(g.progreso)}</span>
                {g.aportar_al_mes && <span>Aportar {fmtEur(g.aportar_al_mes)}/mes</span>}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Plan para llegar a las metas */}
      <Card className="overflow-x-auto">
        <SectionTitle>Plan para llegar a las metas</SectionTitle>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              <th className="py-2 pr-2">Objetivo</th>
              <th className="py-2 px-2 text-right">Meta</th>
              <th className="py-2 px-2 text-right">Ahorrado</th>
              <th className="py-2 px-2 text-right">Falta</th>
              <th className="py-2 px-2 text-right">Fecha objetivo</th>
              <th className="py-2 px-2 text-right">Meses rest.</th>
              <th className="py-2 pl-2 text-right">Aportar/mes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((g) => (
              <tr key={g.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <td className="py-2 pr-2 font-medium text-slate-700 dark:text-slate-200">{g.nombre}</td>
                <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">{fmtEur(g.meta)}</td>
                <td className="py-2 px-2 text-right text-verde-600">{fmtEur(g.ahorrado)}</td>
                <td className="py-2 px-2 text-right text-slate-700 dark:text-slate-200">{fmtEur(g.falta)}</td>
                <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">{g.fecha_objetivo ?? '—'}</td>
                <td className="py-2 px-2 text-right text-slate-500 dark:text-slate-400">{g.meses_restantes ?? '—'}</td>
                <td className="py-2 pl-2 text-right font-semibold text-salmon-600">{g.aportar_al_mes ? fmtEur(g.aportar_al_mes) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold">
              <td className="py-2 pr-2">TOTAL</td>
              <td className="py-2 px-2 text-right">{fmtEur(lista.reduce((a, g) => a + num(g.meta), 0))}</td>
              <td className="py-2 px-2 text-right">{fmtEur(lista.reduce((a, g) => a + num(g.ahorrado), 0))}</td>
              <td className="py-2 px-2 text-right">{fmtEur(lista.reduce((a, g) => a + num(g.falta), 0))}</td>
              <td colSpan={2} />
              <td className="py-2 pl-2 text-right text-salmon-600">{fmtEur(sumaAportar)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* ¿Os da el presupuesto? */}
      <Card>
        <SectionTitle>¿Os da el presupuesto?</SectionTitle>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">Necesitáis apartar cada mes (suma de objetivos)</span>
            <span className="font-semibold text-salmon-600">{fmtEur(sumaAportar)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">Ahorro mensual previsto según el presupuesto</span>
            <span className={`font-semibold ${ahorroPrevisto < 0 ? 'text-salmon-600' : 'text-verde-600'}`}>{fmtEur(ahorroPrevisto)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2">
            <span className="font-medium text-slate-700 dark:text-slate-200">Diferencia {diferencia < 0 && '(en rojo: hay que recortar gastos)'}</span>
            <span className={`font-bold ${diferencia < 0 ? 'text-salmon-600' : 'text-verde-600'}`}>{fmtEur(diferencia)}</span>
          </div>
        </div>
      </Card>
    </div>
  )
}
