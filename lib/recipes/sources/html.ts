function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

export type RecipeLink = {
  url: string
  title: string
}

export function extractRecipeLinks(
  html: string,
  baseUrl: string,
  pathPattern: RegExp,
  limit = 20,
): RecipeLink[] {
  const base = new URL(baseUrl)
  const links: RecipeLink[] = []
  const seen = new Set<string>()

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1]
    const rawTitle = match[2]
    let url: URL
    try {
      url = new URL(href, base)
    } catch {
      continue
    }
    if (url.hostname !== base.hostname || !pathPattern.test(url.pathname)) continue
    url.hash = ''
    const canonicalUrl = url.toString()
    if (seen.has(canonicalUrl)) continue
    seen.add(canonicalUrl)

    const title = stripTags(rawTitle)
    links.push({ url: canonicalUrl, title: title || url.pathname.split('/').filter(Boolean).at(-1)?.replace(/[-_]+/g, ' ') || canonicalUrl })
    if (links.length >= limit) break
  }

  return links
}
