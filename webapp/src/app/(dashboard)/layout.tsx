import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import DashboardHeader from '@/components/layout/DashboardHeader'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef8ff_45%,#f5fff8_100%)]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader user={user} />
        <main className="flex flex-1 flex-col overflow-y-auto p-4 md:p-6">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
