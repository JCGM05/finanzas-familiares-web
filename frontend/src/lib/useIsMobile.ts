import { useEffect, useState } from 'react'

// Detecta móvil por TAMAÑO de pantalla (no user-agent): más fiable y acierta
// también al girar el móvil o usar tablet. Breakpoint: < 768px (md de Tailwind).
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const on = () => setIsMobile(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [breakpoint])
  return isMobile
}
