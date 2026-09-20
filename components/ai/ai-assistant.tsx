import { useState } from 'react'
import { Bot, Sparkles } from 'lucide-react'

const SUGGESTIONS = ['Nákup na týden do 2 500 Kč', 'Kde ušetřím na seznamu?', 'Rozděl nákup mezi obchody']

export function AiAssistant({ onShopping }: { onShopping: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')

  function suggest(value = prompt) {
    if (!value.trim()) return
    setPrompt(value)
    setAnswer(
      value.toLowerCase().includes('akce') || value.toLowerCase().includes('ušet')
        ? 'Na vašem seznamu vidím 3 položky v akci. Přesunem mléka a kuřecích prsou do levnějších obchodů můžete ušetřit přibližně 85 Kč.'
        : 'Doporučuji týdenní nákup do 2 500 Kč. Přidám základní potraviny, porovnám akce a nechám rezervu 380 Kč.',
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-3xl bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#d7f36b] text-[#27320d]">
          <Bot />
        </div>
        <h2 className="mt-6 text-3xl font-semibold tracking-tight">Váš nákupní parťák.</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed opacity-70">
          Řekněte mi, co potřebujete. Pomůžu vám sestavit nákup, najít akce a uhlídat rozpočet.
        </p>
        <div className="mt-7 flex gap-2 rounded-2xl bg-white/10 p-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) suggest()
            }}
            placeholder="Např. nákup na týden do 2 500 Kč"
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/50"
          />
          <button onClick={() => suggest()} className="rounded-xl bg-[#d7f36b] px-4 py-2 text-sm font-semibold text-[#27320d]">
            Navrhnout
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => suggest(suggestion)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
            >
              {suggestion}
            </button>
          ))}
        </div>
        {answer && (
          <div className="mt-4 rounded-2xl bg-white/10 p-4 text-sm leading-relaxed">
            <Sparkles className="mb-2 h-4 w-4 text-[#d7f36b]" />
            {answer}
            <button onClick={onShopping} className="mt-3 block font-semibold text-[#d7f36b]">
              Otevřít nákupní seznam →
            </button>
          </div>
        )}
      </div>
      <div className="rounded-3xl border border-border bg-card p-6">
        <p className="text-sm font-semibold">Co umí váš asistent?</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['Najde akce', 'Porovná ceny v obchodech'],
            ['Pohlídá rozpočet', 'Udrží nákup pod limitem'],
            ['Naplánuje nákup', 'Rozdělí položky chytře'],
          ].map(([a, b]) => (
            <div key={a} className="rounded-2xl bg-muted p-4">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="mt-4 text-sm font-medium">{a}</p>
              <p className="mt-1 text-xs text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
