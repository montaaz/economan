import type { Metadata } from 'next'
import { ControlPage } from '@/components/control/control-page'

export const metadata: Metadata = { title: 'Contrôle des stocks' }
export const dynamic = 'force-dynamic'

export default function ControlePage({ searchParams }: { searchParams: Promise<{ jour?: string; dep?: string }> }) {
  return <ControlPage searchParams={searchParams} base="/controle" />
}
