import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Company from './pages/Company'
import Home from './pages/Home'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import OnboardingGuard from './components/OnboardingGuard'
import Product from './pages/Product'
import Resources from './pages/Resources'
import Signup from './pages/Signup'
import Solutions from './pages/Solutions'
import PublicLayout from './layouts/PublicLayout'
import AppShellLayout from './layouts/AppShellLayout'
import OnboardingLayout from './layouts/OnboardingLayout'
import Dashboard from './pages/Dashboard'
import ToolsHub from './pages/ToolsHub'
import ToolBusinessScanner from './pages/tools/ToolBusinessScanner'
import ToolPlaceholder from './pages/tools/ToolPlaceholder'
import { TOOL_CATALOG } from './pages/tools/toolConfig'
import {
  WorkspaceGitHub,
  WorkspaceUrl,
  WorkspaceCreate,
  WorkspaceLoad,
} from './pages/workspace/WorkspacePages'
import Businesses from './pages/Businesses'
import AppSettings from './pages/AppSettings'
import PlansPage from './pages/PlansPage'
import ScanHistory from './pages/ScanHistory'
import ScanReport from './pages/ScanReport'
import './App.css'

const toolBySlug = Object.fromEntries(TOOL_CATALOG.map((t) => [t.slug, t]))

const App = () => {
  return (
    <Router>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/product" element={<Product />} />
          <Route path="/solutions" element={<Solutions />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/company" element={<Company />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/app/onboarding" element={<OnboardingLayout />} />

          <Route element={<OnboardingGuard />}>
            <Route element={<AppShellLayout />}>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/scans" element={<ScanHistory />} />
              <Route path="/app/scans/:id" element={<ScanReport />} />
              <Route path="/app/workspace/github" element={<WorkspaceGitHub />} />
              <Route path="/app/workspace/url" element={<WorkspaceUrl />} />
              <Route path="/app/workspace/create" element={<WorkspaceCreate />} />
              <Route path="/app/workspace/load" element={<WorkspaceLoad />} />
              <Route path="/app/tools" element={<ToolsHub />} />
              <Route path="/app/tools/business-scanner" element={<ToolBusinessScanner />} />
              <Route
                path="/app/tools/store-health"
                element={
                  <ToolPlaceholder
                    title={toolBySlug['store-health'].title}
                    tagline={toolBySlug['store-health'].tagline}
                    description={toolBySlug['store-health'].description}
                    iconKey="health"
                  />
                }
              />
              <Route
                path="/app/tools/social-analyzer"
                element={
                  <ToolPlaceholder
                    title={toolBySlug['social-analyzer'].title}
                    tagline={toolBySlug['social-analyzer'].tagline}
                    description={toolBySlug['social-analyzer'].description}
                    iconKey="social"
                  />
                }
              />
              <Route
                path="/app/tools/competitor-tracker"
                element={
                  <ToolPlaceholder
                    title={toolBySlug['competitor-tracker'].title}
                    tagline={toolBySlug['competitor-tracker'].tagline}
                    description={toolBySlug['competitor-tracker'].description}
                    iconKey="track"
                  />
                }
              />
              <Route
                path="/app/tools/growth-coach"
                element={
                  <ToolPlaceholder
                    title={toolBySlug['growth-coach'].title}
                    tagline={toolBySlug['growth-coach'].tagline}
                    description={toolBySlug['growth-coach'].description}
                    iconKey="coach"
                  />
                }
              />
              <Route path="/app/businesses" element={<Businesses />} />
              <Route path="/app/plans" element={<PlansPage />} />
              <Route path="/app/settings" element={<AppSettings />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}

export default App
