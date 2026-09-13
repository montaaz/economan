'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { PackageCheck } from 'lucide-react'
import { Button } from '@/components/ui/glass'
import { useToast } from '@/components/ui/toast'
import { gql, errorMessage } from '@/lib/graphql-client'

const RECEIVE = /* GraphQL */ `
  mutation Receive($id: ID!) {
    receiveOrder(id: $id) { id status }
  }
`

/** L'employé confirme avoir reçu la marchandise — la commande se clôt. */
export function ReceiveButton({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { push } = useToast()
  const [busy, setBusy] = React.useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      await gql(RECEIVE, { id: orderId })
      push('success', 'Réception confirmée — la commande est clôturée.')
      router.refresh()
    } catch (e) {
      push('error', errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button variant="success" loading={busy} onClick={confirm}>
      {!busy ? <PackageCheck className="size-4" /> : null}
      {busy ? 'Confirmation…' : 'J’ai reçu ma commande'}
    </Button>
  )
}
