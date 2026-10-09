import { normalizeProductText } from '@/lib/product-normalize'

export type ProductSubtypeEvidenceSource =
  | 'product_name'
  | 'product_description'
  | 'manufacturer_spec'
  | 'verified_attribute'

export type ProductSubtypeDecision = 'match' | 'review' | 'no_match'

export type ProductSubtypeReviewReason =
  | 'conflicting_evidence'
  | 'insufficient_evidence'
  | 'unsupported_category'
  | 'multiple_candidates'
  | 'existing_assignment'

export interface ProductSubtypeEvidence {
  source: ProductSubtypeEvidenceSource
  field: string
  value: string
  matchedRule: string
  polarity: 'supports' | 'contradicts'
}

export interface ProductSubtypeResolverInput {
  productId: string
  productName: string
  productDescription?: string | null
  /** Canonical parent Product Type key, e.g. "pivo". */
  productTypeKey: string
  /** Informational only; never overwrite an existing assignment. */
  existingSubtypeKey?: string | null
  /** Explicitly verified attributes only. Prefix keys with "manufacturer_spec:" when sourced from a verified manufacturer specification. */
  verifiedAttributes?: Record<string, string | number | boolean | null>
}

export interface ProductSubtypeCandidate {
  subtypeKey: string
  label: string
  evidence: ProductSubtypeEvidence[]
}

export interface ProductSubtypeResolverResult {
  productId: string
  productTypeKey: string
  decision: ProductSubtypeDecision
  proposedSubtypeKey: string | null
  reason: ProductSubtypeReviewReason | null
  candidates: ProductSubtypeCandidate[]
  evidence: ProductSubtypeEvidence[]
  existingSubtypeKey: string | null
  resolverVersion: string
}

export const PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION = '2026-10-v1'

type EvidenceText = {
  source: ProductSubtypeEvidenceSource
  field: string
  value: string
  normalized: string
}

type SubtypeRule = {
  subtypeKey: string
  label: string
  /** All patterns are normalized (lowercase, no diacritics, single spaces). */
  patterns: string[]
  ruleId: string
  priority: number
  /** Mutually exclusive evidence axes. Different axes may coexist and are resolved by priority. */
  conflictAxis?: string
}

type TypeRules = {
  priority: readonly (readonly string[])[]
  subtypes: readonly SubtypeRule[]
}

const subtype = (
  subtypeKey: string,
  label: string,
  ruleId: string,
  patterns: string[],
  priority: number,
  conflictAxis?: string,
): SubtypeRule => ({
  subtypeKey,
  label,
  ruleId,
  patterns: patterns.map(normalizeProductText),
  priority,
  ...(conflictAxis ? { conflictAxis } : {}),
})

const TYPE_RULES: Record<string, TypeRules> = {
  pivo: {
    priority: [['pivo-svetle', 'pivo-polotmave', 'pivo-tmave']],
    subtypes: [
      subtype('pivo-svetle', 'Světlé pivo', 'pivo.svetle.explicit', ['světlé', 'světlý', 'světlá', 'svetle pivo', 'light beer'], 0, 'beer-colour'),
      subtype('pivo-polotmave', 'Polotmavé pivo', 'pivo.polotmave.explicit', ['polotmavé', 'polotmavý', 'polotmavá', 'polotmave pivo', 'amber beer'], 0, 'beer-colour'),
      subtype('pivo-tmave', 'Tmavé pivo', 'pivo.tmave.explicit', ['tmavé', 'tmavý', 'tmavá', 'tmave pivo', 'dark beer', 'černé pivo', 'cerne pivo'], 0, 'beer-colour'),
    ],
  },
  testoviny: {
    priority: [['testoviny-plnene'], ['testoviny-platy-na-lasagne'], ['testoviny-polevkove'], ['testoviny-dlouhe'], ['testoviny-kratke-tvarovane']],
    subtypes: [
      subtype('testoviny-plnene', 'Plněné těstoviny', 'testoviny.plnene.explicit', ['plněné', 'plnené', 'ravioli', 'tortellini', 'tortelloni', 'agnolotti', 'plnena pasta', 'filled pasta'], 0),
      subtype('testoviny-platy-na-lasagne', 'Pláty na lasagne', 'testoviny.lasagne-sheets.explicit', ['pláty na lasagne', 'platy na lasagne', 'lasagne pláty', 'lasagne platy', 'lasagne sheets', 'těstoviny lasagne pláty', 'testoviny lasagne platy'], 1),
      subtype('testoviny-polevkove', 'Polévkové těstoviny', 'testoviny.polevkove.explicit', ['polévkové', 'polevkove', 'do polévky', 'do polevky', 'těstoviny do polévky', 'testoviny do polevky', 'polévkové těstoviny', 'polevkove testoviny', 'drobení', 'drobeni', 'písmenka', 'abeceda', 'soup pasta'], 2),
      subtype('testoviny-dlouhe', 'Dlouhé těstoviny', 'testoviny.dlouhe.explicit', ['dlouhé těstoviny', 'dlouhe testoviny', 'spaghetti', 'špagety', 'spagety', 'linguine', 'tagliatelle', 'fettuccine', 'pappardelle', 'bucatini', 'vermicelli', 'makaróny', 'makarony', 'long pasta'], 3),
      subtype('testoviny-kratke-tvarovane', 'Krátké tvarované těstoviny', 'testoviny.kratke-tvarovane.explicit', ['krátké tvarované', 'kratke tvarovane', 'penne', 'fusilli', 'vřetena', 'vretena', 'kolínka', 'kolinka', 'farfalle', 'rigatoni', 'mušličky', 'muslicky', 'mašličky', 'maslicky', 'šroubky', 'sroubky', 'conchiglie', 'short shaped pasta'], 4),
    ],
  },
  ryze: {
    priority: [
      ['ryze-basmati', 'ryze-jasminova'],
      ['ryze-arborio-na-rizoto'],
      ['ryze-natural-celozrnna'],
      ['ryze-parboiled'],
      ['ryze-ostatni-dlouhozrnna', 'ryze-ostatni-kulatozrnna'],
    ],
    subtypes: [
      subtype('ryze-basmati', 'Rýže basmati', 'ryze.basmati.explicit', ['basmati'], 0, 'rice-variety'),
      subtype('ryze-jasminova', 'Jasmínová rýže', 'ryze.jasmin.explicit', ['jasmínová', 'jasminova', 'jasmínová rýže', 'jasminova ryze', 'jasmine rice'], 0, 'rice-variety'),
      subtype('ryze-arborio-na-rizoto', 'Arborio / rýže na rizoto', 'ryze.arborio-risotto.explicit', ['arborio', 'rýže na rizoto', 'ryze na rizoto', 'risotto rice'], 1),
      subtype('ryze-natural-celozrnna', 'Natural / celozrnná rýže', 'ryze.natural-wholegrain.explicit', ['natural', 'celozrnná', 'celozrnna', 'hnědá rýže', 'hneda ryze', 'brown rice', 'wholegrain rice', 'whole grain rice'], 2, 'rice-processing'),
      subtype('ryze-parboiled', 'Parboiled rýže', 'ryze.parboiled.explicit', ['parboiled', 'parboil', 'předvařená rýže', 'predvarena ryze'], 3, 'rice-processing'),
      subtype('ryze-ostatni-dlouhozrnna', 'Ostatní dlouhozrnná rýže', 'ryze.long-grain.explicit', ['dlouhozrnná', 'dlouhozrnna', 'dlouhé zrno', 'dlouhe zrno', 'long grain'], 4, 'rice-grain-shape'),
      subtype('ryze-ostatni-kulatozrnna', 'Ostatní kulatozrnná rýže', 'ryze.round-grain.explicit', ['kulatozrnná', 'kulatozrnna', 'kulaté zrno', 'kulate zrno', 'round grain', 'short grain rice'], 4, 'rice-grain-shape'),
    ],
  },
  tvaroh: {
    priority: [['tvaroh-tucny', 'tvaroh-polotucny', 'tvaroh-odtucneny']],
    subtypes: [
      subtype('tvaroh-tucny', 'Tučný tvaroh', 'tvaroh.tucny.explicit', ['tučný', 'tucny', 'tučný tvaroh', 'tucny tvaroh', 'tvaroh tučný', 'tvaroh tucny', 'full-fat quark'], 0, 'quark-fat'),
      subtype('tvaroh-polotucny', 'Polotučný tvaroh', 'tvaroh.polotucny.explicit', ['polotučný', 'polotucny', 'polotučný tvaroh', 'polotucny tvaroh', 'semi-fat quark'], 0, 'quark-fat'),
      subtype('tvaroh-odtucneny', 'Odtučněný tvaroh', 'tvaroh.odtucneny.explicit', ['odtučněný', 'odtucneny', 'nízkotučný', 'nizkotucny', 'odtučněný tvaroh', 'odtucneny tvaroh', 'low-fat quark'], 0, 'quark-fat'),
    ],
  },
  'taveny-syr': {
    priority: [['taveny-syr-porcovany'], ['taveny-syr-platkovy'], ['taveny-syr-roztiratelny']],
    subtypes: [
      subtype('taveny-syr-porcovany', 'Porcovaný tavený sýr', 'taveny-syr.porcovany.explicit', ['porcovaný tavený sýr', 'porcovany taveny syr', 'jednotlivě balené porce', 'jednotlive balene porce', 'trojúhelníčky', 'trojuhelnicky', 'individually wrapped portions'], 0),
      subtype('taveny-syr-platkovy', 'Plátkový tavený sýr', 'taveny-syr.platkovy.explicit', ['plátkový tavený sýr', 'platkovy taveny syr', 'tavený sýr plátky', 'taveny syr platky', 'plátky taveného sýra', 'platky taveného syra', 'sliced processed cheese'], 1),
      subtype('taveny-syr-roztiratelny', 'Roztíratelný tavený sýr', 'taveny-syr.roztiratelny.explicit', ['roztíratelný tavený sýr', 'roztiratelny taveny syr', 'spreadable processed cheese'], 2),
    ],
  },
  'tunak-konzerva': {
    priority: [['tunak-konzerva-ve-vlastni-stave'], ['tunak-konzerva-v-oleji'], ['tunak-konzerva-ve-vodnim-nalevu']],
    subtypes: [
      subtype('tunak-konzerva-ve-vlastni-stave', 'Tuňák ve vlastní šťávě', 'tunak.vlastni-stava.explicit', ['ve vlastní šťávě', 've vlastni stave', 'vlastní šťáva', 'vlastni stava', 'own juice', 'in its own juice'], 0, 'tuna-medium'),
      subtype('tunak-konzerva-v-oleji', 'Tuňák v oleji', 'tunak.olej.explicit', ['v oleji', 'v olivovém oleji', 'v olivovem oleji', 'v rostlinném oleji', 'v rostlinnem oleji', 'v slunečnicovém oleji', 'v slunecnicovem oleji', 'olejový nálev', 'olejovy nalev', 'olivový olej', 'olivovy olej', 'slunečnicový olej', 'slunecnicovy olej', 'in oil', 'olive oil', 'sunflower oil'], 1, 'tuna-medium'),
      subtype('tunak-konzerva-ve-vodnim-nalevu', 'Tuňák ve vodním nálevu', 'tunak.vodni-nalev.explicit', ['ve vodním nálevu', 've vodnim nalevu', 'vodní nálev', 'vodni nalev', 've vodě', 've vode', 'in water', 'water brine'], 2, 'tuna-medium'),
    ],
  },
}

const TUNA_CONFLICTS: Readonly<Record<string, readonly string[]>> = {
  'tunak-konzerva-ve-vlastni-stave': ['tunak-konzerva-v-oleji'],
  'tunak-konzerva-v-oleji': ['tunak-konzerva-ve-vlastni-stave', 'tunak-konzerva-ve-vodnim-nalevu'],
  'tunak-konzerva-ve-vodnim-nalevu': ['tunak-konzerva-v-oleji'],
}

function hasPhrase(normalizedText: string, phrase: string): boolean {
  return new RegExp(`(?:^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(normalizedText)
}

function getEvidenceTexts(input: ProductSubtypeResolverInput): EvidenceText[] {
  const texts: EvidenceText[] = []
  const add = (source: ProductSubtypeEvidenceSource, field: string, value: string | null | undefined) => {
    if (typeof value !== 'string' || !value.trim()) return
    texts.push({ source, field, value: value.trim(), normalized: normalizeProductText(value) })
  }

  add('product_name', 'name', input.productName)
  add('product_description', 'description', input.productDescription)

  for (const field of Object.keys(input.verifiedAttributes ?? {}).sort()) {
    const value = input.verifiedAttributes?.[field]
    if (value === null || value === undefined || String(value).trim() === '') continue
    const manufacturerSpecPrefix = /^(?:manufacturer_spec(?::|$)|manufacturerSpec\.|manufacturer_spec\.)/i
    const isManufacturerSpec = manufacturerSpecPrefix.test(field)
    const canonicalField = field.replace(manufacturerSpecPrefix, '') || field
    add(isManufacturerSpec ? 'manufacturer_spec' : 'verified_attribute', canonicalField, String(value))
  }

  return texts
}

type Signal = {
  rule: SubtypeRule
  evidence: ProductSubtypeEvidence
}

function collectSignals(rules: TypeRules, texts: EvidenceText[]): Signal[] {
  const signals: Signal[] = []
  for (const rule of rules.subtypes) {
    for (const text of texts) {
      for (const phrase of rule.patterns) {
        if (!hasPhrase(text.normalized, phrase)) continue
        signals.push({
          rule,
          evidence: {
            source: text.source,
            field: text.field,
            value: text.value,
            matchedRule: `${rule.ruleId}: explicit phrase "${phrase}"`,
            polarity: 'supports',
          },
        })
      }
    }
  }
  return signals
}

function conflicts(a: SubtypeRule, b: SubtypeRule): boolean {
  if (a.subtypeKey === b.subtypeKey) return false
  if (a.conflictAxis && a.conflictAxis === b.conflictAxis) {
    if (a.conflictAxis === 'tuna-medium') {
      return (TUNA_CONFLICTS[a.subtypeKey] ?? []).includes(b.subtypeKey)
    }
    return true
  }
  return false
}

function candidateEvidence(rule: SubtypeRule, signals: Signal[]): ProductSubtypeEvidence[] {
  const result: ProductSubtypeEvidence[] = []
  for (const signal of signals) {
    if (signal.rule.subtypeKey === rule.subtypeKey) {
      result.push(signal.evidence)
    } else if (conflicts(rule, signal.rule)) {
      result.push({
        ...signal.evidence,
        matchedRule: `${signal.evidence.matchedRule}; contradicts candidate ${rule.subtypeKey} on ${rule.conflictAxis}`,
        polarity: 'contradicts',
      })
    }
  }
  return result
}

function stableEvidence(evidence: ProductSubtypeEvidence[]): ProductSubtypeEvidence[] {
  const seen = new Set<string>()
  return evidence.filter((item) => {
    const key = [item.source, item.field, item.value, item.matchedRule, item.polarity].join('\u0000')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function result(
  input: ProductSubtypeResolverInput,
  decision: ProductSubtypeDecision,
  reason: ProductSubtypeReviewReason | null,
  candidates: ProductSubtypeCandidate[],
  evidence: ProductSubtypeEvidence[],
  proposedSubtypeKey: string | null = null,
): ProductSubtypeResolverResult {
  return {
    productId: input.productId,
    productTypeKey: input.productTypeKey,
    decision,
    proposedSubtypeKey,
    reason,
    candidates,
    evidence: stableEvidence(evidence),
    existingSubtypeKey: input.existingSubtypeKey?.trim() || null,
    resolverVersion: PRODUCT_SUBTYPE_EVIDENCE_RESOLVER_VERSION,
  }
}

/**
 * Resolves evidence for the six reviewed expansion families only. It is pure and deterministic:
 * no database/network access, no registry activation and no product writes.
 */
export function resolveProductSubtypeEvidence(input: ProductSubtypeResolverInput): ProductSubtypeResolverResult {
  const rules = TYPE_RULES[input.productTypeKey]
  const texts = getEvidenceTexts(input)
  const signals = rules ? collectSignals(rules, texts) : []
  const candidates: ProductSubtypeCandidate[] = rules
    ? rules.subtypes
        .filter((rule) => signals.some((signal) => signal.rule.subtypeKey === rule.subtypeKey))
        .map((rule) => ({
          subtypeKey: rule.subtypeKey,
          label: rule.label,
          evidence: stableEvidence(candidateEvidence(rule, signals)),
        }))
    : []
  const evidence = candidates.flatMap((candidate) => candidate.evidence)

  // An existing assignment is informational only and takes precedence over any new proposal.
  if (input.existingSubtypeKey?.trim()) {
    return result(input, 'review', 'existing_assignment', candidates, evidence)
  }

  if (!rules) {
    return result(input, 'review', 'unsupported_category', candidates, evidence)
  }

  if (candidates.length === 0) {
    return result(input, 'no_match', 'insufficient_evidence', [], [])
  }

  const matchedKeys = new Set(candidates.map((candidate) => candidate.subtypeKey))

  // Preservation media are mutually exclusive, except that the explicit phrase "ve vlastní šťávě"
  // takes precedence over generic water wording. Oil cannot be reconciled with either label.
  if (input.productTypeKey === 'tunak-konzerva') {
    const matchedRules = rules.subtypes.filter((rule) => matchedKeys.has(rule.subtypeKey))
    const hasMediumConflict = matchedRules.some((rule, index) =>
      matchedRules.slice(index + 1).some((other) => conflicts(rule, other)),
    )
    if (hasMediumConflict) {
      return result(input, 'review', 'conflicting_evidence', candidates, evidence)
    }
  }

  for (const priorityGroup of rules.priority) {
    const matches = priorityGroup.filter((key) => matchedKeys.has(key))
    if (matches.length > 1) {
      const groupCandidates = candidates.filter((candidate) => matches.includes(candidate.subtypeKey))
      return result(input, 'review', 'conflicting_evidence', groupCandidates, groupCandidates.flatMap((candidate) => candidate.evidence))
    }
    if (matches.length === 1) {
      const chosen = matches[0]
      const candidate = candidates.find((item) => item.subtypeKey === chosen)
      if (!candidate) break
      return result(input, 'match', null, candidates, evidence, chosen)
    }
  }

  return result(input, 'review', 'multiple_candidates', candidates, evidence)
}
