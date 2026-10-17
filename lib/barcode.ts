const GTIN_LENGTHS = new Set([8, 12, 13, 14])

export function isValidGtin(value: string): boolean {
  if (!GTIN_LENGTHS.has(value.length) || !/^\d+$/.test(value)) return false

  const digits = [...value].map(Number)
  const checkDigit = digits.pop()
  if (checkDigit === undefined) return false

  const weightedSum = digits.reduce((sum, digit, index) => {
    const weight = (digits.length - index) % 2 === 1 ? 3 : 1
    return sum + digit * weight
  }, 0)

  return (10 - (weightedSum % 10)) % 10 === checkDigit
}

export function openFoodFactsProductName(value: unknown, requestedCode: string): string | null {
  if (!value || typeof value !== 'object') return null
  const response = value as { code?: unknown; status?: unknown; product?: unknown }
  if (response.code !== requestedCode || response.status !== 1 || !response.product || typeof response.product !== 'object') return null

  const product = response.product as { product_name_cs?: unknown; product_name?: unknown }
  const name =
    (typeof product.product_name_cs === 'string' && product.product_name_cs.trim()) ||
    (typeof product.product_name === 'string' && product.product_name.trim())

  if (!name || name.length > 300 || /[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}
