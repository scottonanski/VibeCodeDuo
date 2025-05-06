import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VibeCodeDuo',
  description: 'Created with MyBrain',
  generator: 'MyBrain',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
