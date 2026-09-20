import { useState } from 'react'
import { X } from 'lucide-react'

export function ExpenseModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (amount: number, note: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  function save() {
    const value = Number(amount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) {
      setError('Zadejte částku větší než 0.')
      return
    }
    setError('')
    onSave(value, note.trim() || 'Nový výdaj')
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nový výdaj</h2>
          <button onClick={onClose} aria-label="Zavřít" className="icon-button">
            <X />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label className="block text-sm">
            Částka
            <input
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              type="text"
              inputMode="decimal"
              placeholder="0,00 Kč"
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <label className="block text-sm">
            Poznámka
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Např. nákup v Lidlu"
              className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button onClick={save} className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground">
            Uložit výdaj
          </button>
        </div>
      </div>
    </div>
  )
}
