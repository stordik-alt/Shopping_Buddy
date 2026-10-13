import { useState } from 'react'
import { History } from 'lucide-react'
import { getAuditLogAction } from '@/app/actions/audit'
import { CollapsibleSection } from '@/components/shared/collapsible-section'
import { Button } from '@/components/ui/button'
import type { AuditEntry } from '@/lib/db/audit'
import { auditDetailText, auditLabel } from '@/lib/audit'
import { userFacingError } from '@/lib/errors'

// The owner's view of who changed what (docs/35_SECURITY_AUDIT.md, S18). Loaded on request, not with the
// page: most visits never need it, and it is a query the page would otherwise pay for every time.
export function AuditLogSection() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setEntries(await getAuditLogAction())
    } catch (err) {
      setError(userFacingError(err, 'Historii se nepodařilo načíst.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <CollapsibleSection title="Historie změn" icon={<History />} summary="Kdo změnil rozpočet, výdaje, příjmy a členy">
      {entries === null ? (
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? 'Načítám…' : 'Zobrazit historii'}
        </Button>
      ) : entries.length === 0 ? (
        <p className="text-sm text-fg-muted">Zatím tu není žádná zaznamenaná změna. Zapisují se od zavedení historie, uchovávají se rok.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="min-w-0 py-2.5 text-sm">
              <p className="break-words">
                <span className="font-medium">{entry.actor ?? 'Bývalý člen'}</span> · {auditLabel(entry.action)}
              </p>
              <p className="break-words text-xs text-fg-muted">
                {new Date(entry.createdAt).toLocaleString('cs-CZ')}
                {auditDetailText(entry.detail) && ` · ${auditDetailText(entry.detail)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </CollapsibleSection>
  )
}
