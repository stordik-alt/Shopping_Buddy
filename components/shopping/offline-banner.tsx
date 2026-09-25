import { CloudOff, RefreshCw, X } from 'lucide-react'
import { itemCountLabel } from '@/lib/format'

// Tells the household the shopping list is working without a signal (lib/offline-queue.ts): changes
// are kept on the phone and sent when the connection returns. Also reports changes the server refused
// after reconnecting (another member had removed the item meanwhile), so nothing disappears silently.
export function OfflineBanner({ online, pending, dropped, onDismissDropped }: { online: boolean; pending: number; dropped: number; onDismissDropped: () => void }) {
  if (online && pending === 0 && dropped === 0) return null
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {(!online || pending > 0) && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3 text-sm">
          {online ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden /> : <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
          <p className="min-w-0">
            {online ? 'Odesílám změny ze seznamu…' : 'Jste bez signálu. Seznam funguje dál — změny se uloží, až bude připojení.'}
            {pending > 0 && <span className="block text-xs text-muted-foreground">Čeká na odeslání: {itemCountLabel(pending)}</span>}
          </p>
        </div>
      )}
      {dropped > 0 && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="min-w-0">Některé změny už nešlo uložit, protože položku mezitím upravil nebo smazal někdo jiný ({dropped}). Seznam ukazuje aktuální stav.</p>
          <button type="button" onClick={onDismissDropped} className="icon-button -m-1 shrink-0" aria-label="Zavřít upozornění">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
