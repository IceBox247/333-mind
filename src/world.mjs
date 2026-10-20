/**
 * 333's window on the world: a small, shuffled sample of what humans are
 * talking about right now, from free sources (no API credits). Never throws;
 * an empty list just means a quiet window this cycle.
 */
const pick = (arr, n) => arr.sort(() => Math.random() - 0.5).slice(0, n)
const timeout = () => AbortSignal.timeout(10_000)

async function hackerNews(n) {
  const ids = await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: timeout() })).json()
  const items = await Promise.all(pick(ids.slice(0, 30), n).map((id) => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: timeout() }).then((r) => r.json())))
  return items.filter((i) => i?.title).map((i) => ({ source: 'tech forum', text: i.title }))
}

async function googleNews(region, label, n) {
  const xml = await (await fetch(`https://news.google.com/rss?${region}`, { signal: timeout() })).text()
  const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([^<]+)<\/title>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'))
  return pick(titles.slice(0, 25), n).map((t) => ({ source: label, text: t }))
}

export async function observe() {
  const results = await Promise.allSettled([
    hackerNews(4),
    googleNews('hl=en-US&gl=US&ceid=US:en', 'world news', 4),
    googleNews('hl=en-NG&gl=NG&ceid=NG:en', 'lagos news', 3),
  ])
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
}
