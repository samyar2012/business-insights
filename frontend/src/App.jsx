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
import ActionPlan from './pages/ActionPlan'
import ToolGrowthCoach from './pages/tools/ToolGrowthCoach'
import ToolPlaceholder from './pages/tools/ToolPlaceholder'
import { toolBySlug } from './pages/tools/toolConfig'
import {
  WorkspaceGitHub,
  WorkspaceUrl,
  WorkspaceCreate,
  WorkspaceLoad,
} from './pages/workspace/WorkspacePages'
import Businesses from './pages/Businesses'
import AppSettings from './pages/AppSettings'
import PlansPage from './pages/PlansPage'
import BusinessResearchReport from './pages/BusinessResearchReport'
import WebsiteReport from './pages/WebsiteReport'
import './App.css'

const PreviewTool = ({ slug }) => {
  const tool = toolBySlug(slug)
  if (!tool) return <Navigate to="/app/tools" replace />
  return (
    <ToolPlaceholder
      title={tool.title}
      tagline={tool.tagline}
      description={tool.description}
      iconKey={tool.icon}
    />
  )
}

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
              <Route path="/app/action-plan" element={<ActionPlan />} />
              <Route path="/app/research/:businessId" element={<BusinessResearchReport />} />
              <Route path="/app/businesses/:businessId/website-report" element={<WebsiteReport />} />
              <Route path="/app/workspace/github" element={<WorkspaceGitHub />} />
              <Route path="/app/workspace/url" element={<WorkspaceUrl />} />
              <Route path="/app/workspace/create" element={<WorkspaceCreate />} />
              <Route path="/app/workspace/load" element={<WorkspaceLoad />} />
              <Route path="/app/tools" element={<ToolsHub />} />
              <Route path="/app/tools/growth-coach" element={<ToolGrowthCoach />} />
              <Route
                path="/app/tools/business-scanner"
                element={<PreviewTool slug="business-scanner" />}
              />
              <Route path="/app/tools/store-health" element={<PreviewTool slug="store-health" />} />
              <Route
                path="/app/tools/content-generator"
                element={<PreviewTool slug="content-generator" />}
              />
              <Route
                path="/app/tools/competitor-tracker"
                element={<PreviewTool slug="competitor-tracker" />}
              />
              <Route
                path="/app/tools/social-analyzer"
                element={<PreviewTool slug="social-analyzer" />}
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
