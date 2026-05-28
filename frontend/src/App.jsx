import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Company from './pages/Company'
import Home from './pages/Home'
import Login from './pages/Login'
import NavBar from './components/general/NavBar'
import ProtectedRoute from './components/ProtectedRoute'
import Product from './pages/Product'
import Resources from './pages/Resources'
import Signup from './pages/Signup'
import Solutions from './pages/Solutions'
import Workspace from './pages/Workspace'
import './App.css'

const App = () => {
  return (
    <Router>
      <div className="app-shell relative isolate min-h-screen overflow-x-hidden text-white">
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="ambient-orb absolute -left-32 top-12 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl sm:top-16 sm:h-96 sm:w-96" />
          <div className="ambient-orb-delay absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-amber-200/18 blur-3xl sm:h-96 sm:w-96 lg:top-24" />
          <div className="ambient-orb ambient-orb-pulse absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-orange-400/12 blur-3xl" />
        </div>
        <NavBar variant="hero" />
        <div className="pt-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/product" element={<Product />} />
            <Route path="/solutions" element={<Solutions />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/company" element={<Company />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/app" element={<Workspace />} />
            </Route>
          </Routes>
        </div>
      </div>
    </Router>
  )
}

export default App
