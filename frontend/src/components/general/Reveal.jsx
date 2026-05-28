import { useEffect, useRef, useState } from 'react'

const variantClass = {
  up: 'reveal-once',
  scale: 'reveal-scale',
}

/**
 * Fades content in when it enters the viewport (once).
 * @param {'up' | 'scale'} [variant] — motion style (default: up)
 */
const Reveal = ({ children, className = '', delay = 0, variant = 'up' }) => {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  const revealClass = variantClass[variant] ?? variantClass.up

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '0px 0px -5% 0px', threshold: 0.05 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${revealClass} ${visible ? 'reveal-visible' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

export default Reveal
