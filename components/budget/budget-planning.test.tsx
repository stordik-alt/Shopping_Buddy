import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BudgetPlanning } from '@/components/budget/budget-planning'
import type { Commitment } from '@/lib/budget-forecast'
import type { PeriodHistoryRow } from '@/lib/budget-history'
import type { usePlannedExpenses } from '@/components/shell/use-planned-expenses'
import type { useBudgetLedger } from '@/components/shell/use-budget-ledger'
import type { useIncomes } from '@/components/shell/use-incomes'
import type { useBudgetOutlook } from '@/components/shell/use-budget-outlook'
import type { BudgetLedger, BudgetOutlook, Income, PlannedExpense } from '@/lib/types'

type State = ReturnType<typeof useIncomes>
type PlannedState = ReturnType<typeof usePlannedExpenses>
type LedgerState = ReturnType<typeof useBudgetLedger>
const noop = async () => {}
const state = (overrides: Partial<State>): State => ({ incomes: [], error: '', retry: () => {}, add: noop, update: noop, remove: noop, receive: noop, ...overrides })

const emptyLedger: BudgetLedger = { carryIn: 0, transfers: 0, pockets: [], plannedTransfersLeft: 0, toClose: null, closed: false, previousClosedStart: null }
const ledgerState = (ledger: BudgetLedger | null, error = ''): LedgerState => ({
  ledger,
  error,
  retry: () => {},
  addPocket: noop,
  updatePocket: noop,
  archivePocket: noop,
  saveToPocket: noop,
  takeFromPocket: noop,
  closePeriod: noop,
  reopenPeriod: noop,
})

type OutlookState = ReturnType<typeof useBudgetOutlook>
const outlookState = (outlook: BudgetOutlook | null, error = ''): OutlookState => ({ outlook, error, retry: () => {}, planCarry: noop })
/** Running period 15. 10.–14. 11. plus two ahead: 38 000 planned income each, 30 000 budget. */
const outlookData: BudgetOutlook = {
  actualNow: 6_800,
  spentNow: 31_200,
  periods: [
    { periodStart: '2026-10-15', plannedIncome: 0, receivedIncome: 0, plannedExpenses: 0, plannedTransfers: 0, plannedCarry: 3_000, budget: 35_000 },
    { periodStart: '2026-11-15', plannedIncome: 38_000, receivedIncome: 0, plannedExpenses: 0, plannedTransfers: 0, plannedCarry: null, budget: 30_000 },
    { periodStart: '2026-12-15', plannedIncome: 38_000, receivedIncome: 0, plannedExpenses: 0, plannedTransfers: 0, plannedCarry: null, budget: 30_000 },
  ],
}

const plannedState = (plannedExpenses: PlannedExpense[] | null, error = ''): PlannedState => ({ plannedExpenses, error, retry: () => {}, add: noop, update: noop, remove: noop, pay: noop })

const render = (
  incomes: State,
  spent = 31_200,
  pockets: LedgerState = ledgerState(emptyLedger),
  commitments: Commitment[] = [],
  plannedExpenses: PlannedState = plannedState([]),
  history: { rows: PeriodHistoryRow[] | null; error: string; retry: () => void } = { rows: [], error: '', retry: () => {} },
  view: { offset?: number; outlook?: OutlookState; period?: string; periodEnd?: string } = {},
) =>
  renderToStaticMarkup(
    <BudgetPlanning
      period={view.period ?? '2026-10-15'}
      periodEnd={view.periodEnd ?? '2026-11-14'}
      today="2026-10-20"
      spent={spent}
      incomes={incomes}
      pockets={pockets}
      history={history}
      plannedExpenses={plannedExpenses}
      commitments={commitments}
      commitmentsFor={() => 0}
      outlook={view.outlook ?? outlookState(null)}
      offset={view.offset ?? 0}
      onOffsetChange={() => {}}
      onOpenExpenses={() => {}}
      budgetPeriod={{ type: 'payday', startDay: 15 }}
      onChangePeriod={noop}
    />,
  )

const income = (overrides: Partial<Income>): Income => ({ id: 'a', amount: 38_000, description: 'Výplata', date: '2026-10-15', status: 'actual', ...overrides })

describe('BudgetPlanning', () => {
  it('keeps actual and planned money apart and subtracts only real money from the balance', () => {
    const html = render(state({ incomes: [income({}), income({ id: 'b', amount: 5_000, description: 'Bonus', date: '2026-11-01', status: 'planned' })] }), 31_200)
    expect(html).toContain('Skutečně')
    expect(html).toContain('Plánováno')
    // 38 000 received − 31 200 paid = 6 800; the planned 5 000 is not part of it.
    expect(html).toMatch(/Skutečný zůstatek.*?6[\s ]800/)
    expect(html).toMatch(/očekávané příjmy 5[\s ]000/)
    expect(html).toContain('Přijato')
    expect(html).toContain('Plánováno na 1. 11.')
  })

  it('offers "Přijato" only for a planned income', () => {
    const planned = render(state({ incomes: [income({ status: 'planned' })] }))
    const received = render(state({ incomes: [income({ status: 'actual' })] }))
    expect(planned).toContain('>Přijato<')
    expect(received).not.toContain('>Přijato<')
  })

  it('flags a planned income that is past its date', () => {
    expect(render(state({ incomes: [income({ status: 'planned', date: '2026-10-15' })] }))).toContain('po termínu')
  })

  it('shows loading, error with retry, and an empty state that says what to do', () => {
    expect(render(state({ incomes: null }))).toContain('Načítám')
    const failed = render(state({ incomes: null, error: 'Příjmy se nepodařilo načíst.' }))
    expect(failed).toContain('role="alert"')
    expect(failed).toContain('Zkusit znovu')
    const empty = render(state({ incomes: [] }))
    expect(empty).toContain('zatím nejsou žádné příjmy')
    expect(empty).toContain('Přidat příjem')
  })
})

describe('BudgetPlanning — carry, Kapsy and closing', () => {
  const pocket = { id: 'p', name: 'Auto', icon: 'car', targetAmount: 150_000, targetDate: '2027-12-31', openingAmount: 0, plannedContribution: 2_000, isReserve: false, balance: 20_000, recommended: 8_667 }

  it('adds the carry and subtracts what was saved, showing the carry with its sign', () => {
    // 38 000 received + 1 800 carry − 31 200 paid − 2 000 saved = 6 600.
    const html = render(state({ incomes: [income({})] }), 31_200, ledgerState({ ...emptyLedger, carryIn: 1_800, transfers: 2_000 }))
    expect(html).toMatch(/Převod z předchozího období.*?\+1[\s ]800/)
    expect(html).toMatch(/Uloženo do Kapes.*?2[\s ]000/)
    expect(html).toMatch(/Skutečný zůstatek.*?6[\s ]600/)
    expect(render(state({ incomes: [income({})] }), 31_200, ledgerState({ ...emptyLedger, carryIn: -2_300 }))).toMatch(/Převod z předchozího období.*?−2[\s ]300/)
  })

  it('shows a Kapsa with its real balance apart from the planned and recommended amounts', () => {
    const html = render(state({}), 0, ledgerState({ ...emptyLedger, pockets: [pocket] }))
    expect(html).toContain('Auto')
    expect(html).toMatch(/20[\s ]000/)
    expect(html).toContain('Plánujete ukládat')
    expect(html).toContain('doporučujeme')
    expect(html).toContain('role="progressbar"')
    // The planned contribution is shown under "Plánováno" and not in the actual balance.
    expect(html).toMatch(/plánované úspory do Kapes 2[\s ]000/)
  })

  it('offers to close a period that has ended, saying what is left or missing', () => {
    const toClose = { periodStart: '2026-09-15', periodEnd: '2026-10-15', received: 38_000, carryIn: 0, expenses: 33_200, transfers: 0, result: 4_800, plannedCarry: null }
    const surplus = render(state({}), 0, ledgerState({ ...emptyLedger, toClose }))
    expect(surplus).toContain('Uzavřít období')
    expect(surplus).toMatch(/zbylo 4[\s ]800/)
    expect(render(state({}), 0, ledgerState({ ...emptyLedger, toClose: { ...toClose, result: -2_300 } }))).toMatch(/schodek 2[\s ]300/)
  })

  it('offers reopening only when a closed period feeds this one', () => {
    expect(render(state({}), 0, ledgerState({ ...emptyLedger, previousClosedStart: '2026-09-15' }))).toContain('Znovu otevřít předchozí období')
    expect(render(state({}), 0, ledgerState(emptyLedger))).not.toContain('Znovu otevřít')
  })

  it('shows loading, error with retry, and an empty state for Kapsy', () => {
    expect(render(state({}), 0, ledgerState(null))).toContain('Načítám')
    const failed = render(state({}), 0, ledgerState(null, 'Kapsy se nepodařilo načíst.'))
    expect(failed).toContain('Kapsy se nepodařilo načíst.')
    expect(failed).toContain('Zkusit znovu')
    expect(render(state({}), 0, ledgerState(emptyLedger))).toContain('Zatím nemáte žádnou Kapsu')
  })
})

describe('BudgetPlanning — forecast', () => {
  const rent: Commitment = { paymentId: 'r', name: 'Nájem', dueDate: '2026-10-25', amount: 12_000 }
  const pocket = { id: 'p', name: 'Rezerva', icon: 'shield', targetAmount: null, targetDate: null, openingAmount: 0, plannedContribution: 1_000, isReserve: true, balance: 5_000, recommended: null }

  it('shows the available and predicted balance and no advice while the end of the period looks fine', () => {
    // 38 000 − 31 200 = 6 800 in hand, 3 800 still due → 3 000 available.
    const html = render(state({ incomes: [income({})] }), 31_200, ledgerState(emptyLedger), [{ ...rent, amount: 3_800 }])
    expect(html).toMatch(/Dostupný zůstatek.*?3[\s ]000/)
    expect(html).toMatch(/Predikovaný zůstatek.*?3[\s ]000/)
    expect(html).not.toContain('bude chybět')
  })

  it('warns of a shortfall in advance and only suggests, never moves money', () => {
    // 1 000 in hand, 12 000 due, 1 000 still planned for savings → 12 000 short; savings and the Kapsa cover part.
    const html = render(state({ incomes: [income({ amount: 1_000 })] }), 0, ledgerState({ ...emptyLedger, pockets: [pocket], plannedTransfersLeft: 1_000 }), [rent])
    expect(html).toMatch(/bude chybět přibližně 12[\s ]000/)
    expect(html).toContain('odložit plánované úspory')
    expect(html).toContain('Kapsu Rezerva')
    expect(html).toContain('záporný převod')
    expect(html).toContain('nic nepřesune bez vašeho potvrzení')
  })

  it('counts a planned expense in the prediction and the reserve is named first in the advice', () => {
    const reserve = { id: 'r', name: 'Rezerva', icon: 'shield', targetAmount: null, targetDate: null, openingAmount: 0, plannedContribution: null, isReserve: true, balance: 9_000, recommended: null }
    const planned: PlannedExpense = { id: 'x', amount: 4_000, note: 'Servis auta', category: 'Ostatní', date: '2026-10-28', status: 'planned' }
    // 1 000 in hand − 4 000 planned = 3 000 short; the plan cannot be trimmed away entirely first? It can: trim 3 000.
    const html = render(state({ incomes: [income({ amount: 1_000 })] }), 0, ledgerState({ ...emptyLedger, pockets: [reserve] }), [], plannedState([planned]))
    expect(html).toMatch(/bude chybět přibližně 3[\s ]000/)
    expect(html).toContain('ubrat z plánovaných výdajů')
    expect(html).toContain('Servis auta')
    // Planned money is not in the actual balance.
    expect(html).toMatch(/Skutečný zůstatek.*?1[\s ]000/)
    const deeper = render(state({ incomes: [income({ amount: 1_000 })] }), 0, ledgerState({ ...emptyLedger, pockets: [reserve] }), [{ paymentId: 'a', name: 'Nájem', dueDate: '2026-10-25', amount: 5_000 }])
    expect(deeper).toContain('finanční rezervy Rezerva')
  })

  it('shows planned expenses with loading, error and empty states', () => {
    expect(render(state({}), 0, ledgerState(emptyLedger), [], plannedState(null))).toContain('Načítám')
    const failed = render(state({}), 0, ledgerState(emptyLedger), [], plannedState(null, 'Plánované výdaje se nepodařilo načíst.'))
    expect(failed).toContain('Plánované výdaje se nepodařilo načíst.')
    expect(render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]))).toContain('nemáte žádné plánované výdaje')
    const paid = render(state({}), 0, ledgerState(emptyLedger), [], plannedState([{ id: 'x', amount: 500, note: 'Dárek', category: 'Ostatní', date: '2026-10-12', status: 'paid' }]))
    expect(paid).toContain('Zaplaceno')
    // A paid plan is no longer expected money.
    expect(paid).toMatch(/Plánované výdaje.*?0[\s ]Kč/)
  })
})

describe('BudgetPlanning — periods ahead', () => {
  const planned = plannedState([{ id: 'p', amount: 2_000, note: 'Servis', category: 'Ostatní', date: '2026-11-20', status: 'planned' }])
  const ahead = { offset: 1, period: '2026-11-15', periodEnd: '2026-12-14', outlook: outlookState(outlookData) }

  it('lists the coming periods with the expected balance and offers to plan them', () => {
    const html = render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), undefined, { outlook: outlookState(outlookData) })
    expect(html).toContain('Výhled dalších období')
    expect(html).toContain('Plánovat')
    // Running period carries the planned 3 000; 3 000 + 38 000 − 30 000 = 11 000.
    expect(html).toMatch(/Predikce 11[\s ]000/)
  })

  it('shows loading and error states of the outlook', () => {
    expect(render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), undefined, { outlook: outlookState(null) })).toContain('Načítám')
    const failed = render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), undefined, { outlook: outlookState(null, 'Výhled se nepodařilo načíst.') })
    expect(failed).toContain('Výhled se nepodařilo načíst.')
    expect(failed).toContain('Zkusit znovu')
  })

  it('says a finished period still to be closed is missing from the outlook', () => {
    const toClose = { periodStart: '2026-09-15', periodEnd: '2026-10-15', received: 38_000, carryIn: 0, expenses: 33_200, transfers: 0, result: 4_800, plannedCarry: null }
    const html = render(state({}), 0, ledgerState({ ...emptyLedger, toClose }), [], plannedState([]), undefined, { outlook: outlookState(outlookData) })
    expect(html).toContain('ještě není uzavřené')
  })

  it('plans a period ahead without actual money, paying or closing', () => {
    const html = render(state({ incomes: [income({ date: '2026-11-15', status: 'planned' })] }), 0, ledgerState(null), [], planned, undefined, ahead)
    expect(html).toContain('Plán budoucího období')
    expect(html).toContain('Plánujete období')
    expect(html).toContain('Plánovaný převod do dalšího období')
    expect(html).toMatch(/Predikovaný zůstatek.*?11[\s ]000/)
    // Nothing of the running period's real money, history or closing belongs to a period that has not begun.
    expect(html).not.toContain('Skutečný zůstatek')
    expect(html).not.toContain('Historie období')
    expect(html).not.toContain('Uzavřít období')
    expect(html).not.toContain('Kapsy')
    // A plan for later cannot be paid or received yet.
    expect(html).not.toContain('>Zaplaceno<')
    expect(html).not.toContain('>Přijato<')
    expect(html).toContain('Servis')
  })

  it('explains a planned carry that exceeds what the period is expected to leave', () => {
    const html = render(state({}), 0, ledgerState(null), [], plannedState([]), undefined, {
      ...ahead,
      outlook: outlookState({ ...outlookData, periods: outlookData.periods.map((entry, index) => (index === 1 ? { ...entry, plannedCarry: 50_000 } : entry)) }),
    })
    // Predicted 11 000: only that much can be carried, not the planned 50 000.
    expect(html).toMatch(/převede se 11[\s ]000/)
  })

  it('disables going back from the running period', () => {
    expect(render(state({}), 0, ledgerState(emptyLedger))).toMatch(/<button[^>]*disabled[^>]*aria-label="Předchozí období"|aria-label="Předchozí období"[^>]*disabled/)
  })
})

describe('BudgetPlanning — history', () => {
  const row: PeriodHistoryRow = { periodStart: '2026-09-15', periodEnd: '2026-10-15', budget: 40_000, received: 38_000, expenses: 31_200, saved: 2_000, carryIn: -300, result: 4_500, closed: true, carryOut: 1_300 }

  it('lists past periods with their real results, carry and closing state', () => {
    const html = render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), { rows: [row, { ...row, periodStart: '2026-08-15', periodEnd: '2026-09-15', result: -2_300, closed: false, carryOut: null, carryIn: 0 }], error: '', retry: () => {} })
    expect(html).toContain('Historie období')
    expect(html).toMatch(/Výsledek 4[\s ]500/)
    expect(html).toMatch(/Schodek 2[\s ]300/)
    expect(html).toMatch(/Převod do dalšího.*?\+1[\s ]300/)
    expect(html).toMatch(/Převod z předchozího.*?−300/)
    expect(html).toContain('Uzavřeno')
    expect(html).toContain('Neuzavřeno')
  })

  it('links each past period to its expenses', () => {
    const html = render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), { rows: [row], error: '', retry: () => {} })
    expect(html).toContain('Zobrazit výdaje')
  })

  it('shows loading, error and empty states', () => {
    expect(render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), { rows: null, error: '', retry: () => {} })).toContain('Načítám')
    expect(render(state({}), 0, ledgerState(emptyLedger), [], plannedState([]), { rows: null, error: 'Historii období se nepodařilo načíst.', retry: () => {} })).toContain('Historii období se nepodařilo načíst.')
    expect(render(state({}), 0, ledgerState(emptyLedger))).toContain('Zatím tu nejsou žádná minulá období')
  })
})
