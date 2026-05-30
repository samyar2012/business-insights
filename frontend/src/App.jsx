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
          <div className="app-blob app-blob-one absolute -left-36 top-8 h-120 w-120 rounded-full bg-white/22 blur-[120px]" />
          <div className="app-blob app-blob-two absolute -right-36 top-1/4 h-112 w-md rounded-full bg-yellow-200/18 blur-[120px]" />
          <div className="app-blob app-blob-three absolute -bottom-28 left-1/3 h-104 w-104 rounded-full bg-yellow-100/16 blur-[110px]" />
          <div className="app-blob app-blob-four absolute left-1/4 top-1/3 h-96 w-96 rounded-full bg-white/14 blur-[100px]" />
          <div className="app-blob app-blob-five absolute right-1/4 top-14 h-88 w-88 rounded-full bg-yellow-100/14 blur-[105px]" />
          <div className="app-blob app-blob-six absolute left-12 bottom-16 h-80 w-80 rounded-full bg-white/10 blur-[95px]" />
          <div className="app-blob app-blob-seven absolute right-10 bottom-1/4 h-72 w-72 rounded-full bg-yellow-200/12 blur-[90px]" />
          <div className="app-blob app-blob-eight absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-[85px]" />
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
