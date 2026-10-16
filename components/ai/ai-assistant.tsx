'use client'

import { ArrowUp, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { AnitkaAvatar } from '@/components/shared/brand'

const SUGGESTIONS = ['Nákup na týden do 2 500 Kč', 'Kde ušetřím na seznamu?', 'Rozděl nákup mezi obchody']

const FIRST_MESSAGE =
  'Ahoj, jsem Anitka. Chat je připravený, ale AI asistent zatím není připojený, takže teď dotazy neumím zpracovat.'

const NOT_AVAILABLE_ANSWER =
  'AI asistent zatím není zapojený, takže na dotazy neodpovídá. Porovnání cen, akce a plán nákupu podle rozpočtu najdete v nákupním seznamu.'

type Message = { role: 'assistant' | 'user'; text: string }

export function AiAssistant({ onShopping }: { onShopping: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', text: FIRST_MESSAGE }])

  function send(value: string) {
    const text = value.trim()
    if (!text) return
    setMessages((current) => [...current, { role: 'user', text }, { role: 'assistant', text: NOT_AVAILABLE_ANSWER }])
    setPrompt('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    send(prompt)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center gap-2 rounded-xl bg-accent-subtle px-3 py-2 text-sm font-medium text-accent-text">
        <span className="size-2 shrink-0 rounded-full bg-fg-muted" aria-hidden="true" />
        AI asistent zatím není připojený
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1" aria-live="polite">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`flex items-end gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}>
            {message.role === 'assistant' && <AnitkaAvatar className="size-8 shrink-0" />}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-base leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-md bg-primary text-primary-foreground'
                  : 'rounded-bl-md border border-border bg-background text-foreground'
              }`}
            >
              {message.role === 'assistant' && <Sparkles className="mb-2 size-4 text-accent-text" aria-hidden="true" />}
              <p>{message.text}</p>
              {message.role === 'assistant' && index > 0 && (
                <button
                  type="button"
                  onClick={onShopping}
                  className="mt-3 min-h-10 rounded-lg text-left font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Otevřít nákupní seznam →
                </button>
              )}
            </div>
          </div>
        ))}

        {messages.length === 1 && (
          <div className="pl-10">
            <p className="mb-2 text-sm font-medium text-fg-secondary">Příklady dotazů</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  className="min-h-9 rounded-full border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Napište Anitce…"
          aria-label="Zpráva pro Anitku"
          className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-fg-muted"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          aria-label="Odeslat zprávu"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </form>
      <p className="text-center text-xs leading-relaxed text-fg-secondary">
        Zprávy se zatím nezpracovávají umělou inteligencí.
      </p>
    </div>
  )
}
