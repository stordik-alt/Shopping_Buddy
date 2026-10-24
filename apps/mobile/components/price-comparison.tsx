import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { effectivePrice, isDealActive, previousPrice, comparePrices, type ProductPrice, type PricePoint } from '../../../lib/prices'
import { offerUnitPriceLabel, offersForProduct, shortOfferDate, type StandaloneOffer } from '../../../lib/offers'
import { money, shortDate } from '../../../lib/format'
import { priceSteps, priceTrendSummary } from '../../../lib/price-trend'
import { useMobileTheme } from '../lib/theme'

export function hasPriceComparison(productPrices: ProductPrice[], offers: StandaloneOffer[], productName: string) {
  return Boolean(comparePrices(productPrices, productName) || offersForProduct(offers, productName).length)
}

export function NativePriceComparison({ productName, productPrices, offers, today }: {
  productName: string
  productPrices: ProductPrice[]
  offers: StandaloneOffer[]
  today: string
}) {
  const styles = useStyles()
  const product = comparePrices(productPrices, productName)
  const productOffers = offersForProduct(offers, productName)
  if (!product && productOffers.length === 0) return null

  return <View style={styles.container}>
    {product ? <>
      <Text style={styles.heading}>Porovnání cen mezi obchody</Text>
      <View style={styles.rows}>
        {product.prices.map((price, index) => <PriceRow key={`${price.store}-${index}`} price={price} index={index} today={today} />)}
      </View>
    </> : null}
    {productOffers.length ? <View style={[styles.offers, product && styles.offersSeparated]}>
      <Text style={styles.heading}>Akce bez běžné ceny</Text>
      <Text style={styles.note}>Běžnou cenu neznáme, proto u těchto nabídek neuvádíme slevu ani porovnání.</Text>
      {productOffers.map((offer) => <View key={offer.storeId} style={styles.offerRow}>
        <Text style={styles.store}>{offer.store}</Text>
        <View style={styles.priceDetails}>
          <Text style={styles.deal}>Akce do {shortOfferDate(offer.validUntil)}</Text>
          <Text style={styles.price}>{money(offer.dealPrice)}</Text>
          {offerUnitPriceLabel(offer) ? <Text style={styles.unitPrice}>({offerUnitPriceLabel(offer)})</Text> : null}
        </View>
      </View>)}
    </View> : null}
  </View>
}

function PriceRow({ price, index, today }: { price: PricePoint; index: number; today: string }) {
  const styles = useStyles()
  const old = previousPrice(price)
  return <View style={[styles.priceRow, index === 0 && styles.bestPriceRow]}>
    <View style={styles.rowHeading}>
      <Text style={[styles.store, index === 0 && styles.bestText]}>{price.store}</Text>
      <View style={styles.priceDetails}>
        {isDealActive(price, today) ? <Text style={[styles.deal, index === 0 && styles.bestText]}>Akce do {shortDate(price.dealValidUntil ?? '')}</Text> : null}
        <Text style={[styles.price, index === 0 && styles.bestText]}>{money(effectivePrice(price))}</Text>
        <Text style={styles.unitPrice}>({money(price.unitPrice)}/{price.unit})</Text>
      </View>
    </View>
    {old ? <Text style={styles.oldPrice}>Dříve {money(old.price)} · zaznamenáno {shortDate(old.recordedAt)}{old.validUntil ? `, změna ${shortDate(old.validUntil)}` : ''}</Text> : null}
    <PriceTrend price={price} today={today} />
  </View>
}

function PriceTrend({ price, today }: { price: PricePoint; today: string }) {
  const { colors } = useMobileTheme()
  const styles = useStyles()
  const steps = useMemo(() => priceSteps(price), [price])
  const summary = useMemo(() => priceTrendSummary(steps), [steps])
  const line = useMemo(() => {
    if (!summary) return null
    const width = 140
    const height = 32
    const pad = 5
    const day = (isoDate: string) => {
      const [year, month, date] = isoDate.slice(0, 10).split('-').map(Number)
      return Date.UTC(year, month - 1, date) / 86_400_000
    }
    const start = day(steps[0].date)
    const end = Math.max(day(today), day(steps[steps.length - 1].date))
    const x = (isoDate: string) => pad + ((day(isoDate) - start) / Math.max(1, end - start)) * (width - 2 * pad)
    const y = (value: number) => summary.max === summary.min ? height / 2 : pad + ((summary.max - value) / (summary.max - summary.min)) * (height - 2 * pad)
    let d = `M ${x(steps[0].date)} ${y(steps[0].price)}`
    for (const step of steps.slice(1)) d += ` H ${x(step.date)} V ${y(step.price)}`
    d += ` H ${width - pad}`
    return { d, x, y }
  }, [steps, summary, today])

  if (!summary || !line) return null
  const label = `Vývoj ceny: nejnižší ${money(summary.min)}, nejvyšší ${money(summary.max)}, nyní ${money(summary.current)}`
  return <View style={styles.trendRow}>
    <Svg accessibilityLabel={label} accessible height={32} width={140} viewBox="0 0 140 32">
      <Path d={line.d} fill="none" stroke={colors.accentText} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
      {steps.map((step) => <Circle key={step.date} cx={line.x(step.date)} cy={line.y(step.price)} r={3.5} fill={colors.accentText} stroke={colors.card} strokeWidth={1.5} />)}
    </Svg>
    <Text style={styles.trendNote}>{summary.atLowest ? 'Nejnižší zaznamenaná cena' : `Nejnižší ${money(summary.min)}`} · od {shortDate(steps[0].date)}</Text>
  </View>
}

function useStyles() {
  const { colors } = useMobileTheme()
  return useMemo(() => StyleSheet.create({
    container: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 9 },
    heading: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
    rows: { gap: 6 },
    priceRow: { backgroundColor: colors.muted, borderRadius: 11, padding: 10, gap: 5 },
    bestPriceRow: { backgroundColor: colors.accentSubtle },
    rowHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
    store: { flexShrink: 1, color: colors.foreground, fontSize: 12, fontWeight: '600' },
    bestText: { color: colors.accentText },
    priceDetails: { alignItems: 'flex-end', gap: 2 },
    price: { color: colors.foreground, fontSize: 13, fontWeight: '700' },
    unitPrice: { color: colors.mutedText, fontSize: 10 },
    deal: { color: colors.secondaryText, fontSize: 10, fontWeight: '600' },
    oldPrice: { color: colors.mutedText, fontSize: 10, lineHeight: 15 },
    trendRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
    trendNote: { color: colors.mutedText, fontSize: 10, flexShrink: 1 },
    offers: { gap: 7 },
    offersSeparated: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 9 },
    note: { color: colors.mutedText, fontSize: 11, lineHeight: 15 },
    offerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, backgroundColor: colors.muted, borderRadius: 10, padding: 9 },
  }), [colors])
}
