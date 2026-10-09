import { normalizeProductText } from '@/lib/product-normalize'

const MIN_NORMALIZED_NAME_LENGTH = 3

const NON_RETAIL_ACTIVITY_PATTERN = /\b(maloobchod\w*|velkoobchod\w*|zprostredkov\w*|distribuc\w*|doprava|vystavb\w*|demolicn\w*|bankovnictv\w*|ubytovac\w*|stravovan\w*|podavan\w*|pronajem\w*|pujcov\w*|opravy|udrzb\w*|elektroinstalac\w*|instalacni prace|financni sluzb\w*|pojist\w*|cestovn\w*|vyroba\w*|tezb\w*|pestovan\w*|sklizen\w*|prodej\w*)\b/i

const OBVIOUS_SERVICE_OR_DEFINITION_PATTERN = /\b(sluzb\w*|vyzkum\w*|organizac\w*|instituc\w*|podporne sluzby|lov a odchyt)\b/i

export function getProductTypeCandidateReviewFlags(name: string, language: string): string[] {
  const flags: string[] = []
  const normalized = normalizeProductText(name)
  if (language !== 'cs') flags.push('not_czech')
  if (normalized.length < MIN_NORMALIZED_NAME_LENGTH) flags.push('too_short_after_normalization')
  if (/https?:\/\/|www\./i.test(name)) flags.push('contains_url')
  if (/[.!?;:]$/.test(name.trim()) || /\b(defined as|indicates|any products that|characteristics of|service[s]? for)\b/i.test(name)) {
    flags.push('looks_like_definition_or_service')
  }
  if (OBVIOUS_SERVICE_OR_DEFINITION_PATTERN.test(normalized)) flags.push('possible_service_or_activity')
  if (NON_RETAIL_ACTIVITY_PATTERN.test(normalized)) flags.push('possible_commercial_activity')
  if (/\b(ostatni|ostatni vyrobky|products?)\b/i.test(normalized)) flags.push('generic_or_noncanonical_label')
  if (/\b(pack|packy|sada|set|multipack)\b/i.test(normalized)) flags.push('possible_bundle_or_package')
  if (/\b(thc|cbd|cannabis)\b/i.test(normalized)) flags.push('regulated_or_specialty_term_review')
  return [...new Set(flags)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
}

export function isSuitableCzechRetailProductTypeCandidate(name: string, language: string): boolean {
  const flags = getProductTypeCandidateReviewFlags(name, language)
  return language === 'cs'
    && normalizeProductText(name).length >= MIN_NORMALIZED_NAME_LENGTH
    && !flags.some((flag) => [
      'not_czech',
      'too_short_after_normalization',
      'contains_url',
      'looks_like_definition_or_service',
      'possible_service_or_activity',
      'possible_commercial_activity',
    ].includes(flag))
}
