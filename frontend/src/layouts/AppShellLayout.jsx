import { Outlet } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { SidebarProvider } from '../context/SidebarContext'
import AppSidebar from '../components/app/AppSidebar'
import AppTopBar from '../components/app/AppTopBar'
import PageTransition from '../components/app/PageTransition'

const AppShellLayout = () => {
  const { resolvedTheme } = useTheme()

  return (
    <SidebarProvider>
      <div className="app-workspace min-h-screen" data-app-theme={resolvedTheme}>
        <div className="app-workspace__mesh" aria-hidden />
        <div className="app-workspace__inner flex min-h-screen flex-col">
          <AppTopBar />
          <div className="flex min-h-0 flex-1">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
              <PageTransition>
                <Outlet />
              </PageTransition>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  )
}

export default AppShellLayout
