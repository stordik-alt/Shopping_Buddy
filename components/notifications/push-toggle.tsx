'use client'

import { BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from '@/app/actions/push'
import { userFacingError } from '@/lib/errors'
import { browserPushFacts, currentSubscription, pushAvailability, subscribeThisDevice, type PushAvailability } from '@/lib/push/client'

// "Upozornění do telefonu": lets each member turn push notifications on or off for the device in
// their hand (lib/push/). Rendered only when the server has push configured (a public key).

type State = { status: 'checking' } | { status: 'unavailable'; reason: Exclude<PushAvailability, 'available'> } | { status: 'off' } | { status: 'on' }

const HINTS: Record<Exclude<PushAvailability, 'available'>, string> = {
  'ios-needs-install': 'Na iPhonu nejdřív přidejte Buddyho na plochu (Sdílet → Přidat na plochu) a otevřete ho odtamtud.',
  denied: 'Upozornění jsou pro tuto stránku zablokovaná. Povolte je v nastavení prohlížeče nebo telefonu.',
  unsupported: 'Tento prohlížeč upozornění do telefonu nepodporuje.',
}

export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>({ status: 'checking' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const availability = pushAvailability(browserPushFacts())
      if (availability !== 'available') return setState({ status: 'unavailable', reason: availability })
      const subscription = await currentSubscription()
      if (cancelled) return
      setState({ status: subscription ? 'on' : 'off' })
      // Re-send an existing subscription: the server drops devices the push service reported gone,
      // and this also covers a device subscribed before a sign-in with another account.
      if (subscription) {
        const result = await savePushSubscriptionAction(subscription.toJSON())
        if (!cancelled && !result.ok) setMessage({ tone: 'error', text: result.error })
      }
    }
    check().catch((error) => {
      console.error('Push state check failed', error)
      if (!cancelled) setState({ status: 'unavailable', reason: 'unsupported' })
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function turnOn() {
    setBusy(true)
    setMessage(null)
    try {
      const subscription = await subscribeThisDevice(publicKey)
      if (!subscription) {
        const reason = pushAvailability(browserPushFacts())
        if (reason !== 'available') setState({ status: 'unavailable', reason })
        else setMessage({ tone: 'info', text: 'Upozornění zůstávají vypnutá.' })
        return
      }
      const result = await savePushSubscriptionAction(subscription.toJSON())
      if (!result.ok) {
        await subscription.unsubscribe()
        setMessage({ tone: 'error', text: result.error })
        return
      }
      setState({ status: 'on' })
    } catch (error) {
      console.error('Push subscribe failed', error)
      setMessage({ tone: 'error', text: userFacingError(error, 'Upozornění se nepodařilo zapnout. Zkuste to znovu.') })
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    setMessage(null)
    try {
      const subscription = await currentSubscription()
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setState({ status: 'off' })
    } catch (error) {
      console.error('Push unsubscribe failed', error)
      setMessage({ tone: 'error', text: userFacingError(error, 'Upozornění se nepodařilo vypnout. Zkuste to znovu.') })
    } finally {
      setBusy(false)
    }
  }

  async function sendTest() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await sendTestPushAction()
      setMessage(result.ok ? { tone: 'info', text: 'Zkušební upozornění je na cestě.' } : { tone: 'error', text: result.error })
    } catch (error) {
      console.error('Test push failed', error)
      setMessage({ tone: 'error', text: userFacingError(error, 'Zkušební upozornění se nepodařilo odeslat.') })
    } finally {
      setBusy(false)
    }
  }

  if (state.status === 'checking') return null

  const on = state.status === 'on'
  return (
    <div className="mx-1 mb-1 rounded-xl border border-border bg-muted/40 p-3" data-testid="push-toggle">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2.5">
          <BellRing className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p id="push-toggle-label" className="text-sm font-medium">Upozornění do telefonu</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {state.status === 'unavailable' ? HINTS[state.reason] : on ? 'Zapnuto na tomto zařízení.' : 'Rozpočet, akce a připomínky i se zavřenou aplikací.'}
            </p>
          </div>
        </div>
        {state.status !== 'unavailable' && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="push-toggle-label"
            disabled={busy}
            onClick={on ? turnOff : turnOn}
            className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          >
            <span className={`inline-block size-5 rounded-full bg-background shadow transition ${on ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
          </button>
        )}
      </div>
      {on && (
        <button type="button" onClick={sendTest} disabled={busy} className="mt-2 rounded-lg px-2 py-1 text-[11px] font-medium text-primary hover:bg-muted disabled:opacity-60">
          Poslat zkušební upozornění
        </button>
      )}
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs ${message.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
