import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const PageTransition = ({ children }) => {
  const location = useLocation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(false)
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [location.pathname])

  return (
    <div className={`app-page ${visible ? 'app-page--visible' : ''}`} key={location.pathname}>
      {children}
    </div>
  )
}

export default PageTransition
