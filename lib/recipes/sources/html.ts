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


export function extractRecipeLinksFromRss(
  xml: string,
  baseUrl: string,
  pathPattern: RegExp,
  limit = 20,
): RecipeLink[] {
  const base = new URL(baseUrl)
  const links: RecipeLink[] = []
  const seen = new Set<string>()

  for (const item of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = item[1]
    const titleMatch = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
    const linkMatch = block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)
    if (!linkMatch) continue

    const rawHref = linkMatch[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()
    let url: URL
    try {
      url = new URL(decodeHtmlEntities(rawHref), base)
    } catch {
      continue
    }

    if (url.hostname !== base.hostname || !pathPattern.test(url.pathname)) continue
    url.hash = ''
    const canonicalUrl = url.toString()
    if (seen.has(canonicalUrl)) continue
    seen.add(canonicalUrl)

    const rawTitle = titleMatch?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, '') ?? ''
    const title = stripTags(rawTitle)
    links.push({
      url: canonicalUrl,
      title: title || url.pathname.split('/').filter(Boolean).at(-1)?.replace(/[-_]+/g, ' ') || canonicalUrl,
    })
    if (links.length >= limit) break
  }

  return links
}
