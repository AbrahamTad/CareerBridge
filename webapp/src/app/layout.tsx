import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'CareerBridge AI — AI-Driven Job Search',
    template: '%s | CareerBridge AI',
  },
  description:
    'Find the right job or LIA placement with AI-powered CV analysis, job matching, and tailored applications. Built for the Swedish job market.',
  keywords: ['job search', 'AI', 'CV', 'LIA', 'internship', 'Sweden', 'jobb', 'praktik'],
  openGraph: {
    type: 'website',
    locale: 'sv_SE',
    url: process.env.NEXT_PUBLIC_APP_URL,
    title: 'CareerBridge AI',
    description: 'AI-Driven Job Search for the Swedish market',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
