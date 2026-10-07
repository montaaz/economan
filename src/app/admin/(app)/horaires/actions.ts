'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/server/auth/guards'
import { reglerDebutJournee } from '@/server/day-start'

export async function enregistrerDebutJournee(hhmm: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(['ADMIN'], '/admin/login')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return { ok: false, error: 'Heure invalide (HH:MM).' }
  await reglerDebutJournee(hhmm)
  revalidatePath('/', 'layout')
  return { ok: true }
}
