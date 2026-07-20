import { useCallback, useEffect, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

// Ejecuta una promesa y reejecuta cuando cambian las dependencias.
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // fn cambia en cada render; la fijamos por deps + tick a propósito.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, [...deps, tick])

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setError(null)
    run()
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && setError(e.message ?? String(e)))
      .finally(() => vivo && setLoading(false))
    return () => {
      vivo = false
    }
  }, [run])

  return { data, loading, error, reload: () => setTick((t) => t + 1) }
}
