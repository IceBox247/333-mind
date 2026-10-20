/**
 * Minimal X API v2 client with OAuth 1.0a user signing.
 *
 * Keys (Windows user env, never in the repo):
 *   X_API_KEY, X_API_SECRET          the developer app's consumer keys
 *   NOCT_X_TOKEN, NOCT_X_SECRET      access token for the NOCT account (from npm run x-auth)
 */
import { createHmac, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export function secret(name) {
  if (process.env[name]) return process.env[name]
  if (process.platform !== 'win32') return ''
  try {
    return execFileSync('powershell', ['-NoProfile', '-Command', `[Environment]::GetEnvironmentVariable('${name}','User')`], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

/** OAuth 1.0a Authorization header. `params` are query/form params that must be signed. */
export function oauthHeader(method, url, { token = '', tokenSecret = '', params = {}, extra = {} } = {}) {
  const oauth = {
    oauth_consumer_key: secret('X_API_KEY'),
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token } : {}),
    ...extra,
  }
  if (!oauth.oauth_consumer_key) throw new Error('X_API_KEY is not set')
  const all = { ...params, ...oauth }
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join('&'))].join('&')
  const key = `${enc(secret('X_API_SECRET'))}&${enc(tokenSecret)}`
  oauth.oauth_signature = createHmac('sha1', key).update(base).digest('base64')
  return 'OAuth ' + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(', ')
}

const user = () => {
  const token = secret('NOCT_X_TOKEN')
  const tokenSecret = secret('NOCT_X_SECRET')
  if (!token || !tokenSecret) throw new Error('NOCT_X_TOKEN / NOCT_X_SECRET not set. Run: npm run x-auth')
  return { token, tokenSecret }
}

async function get(path, query = {}) {
  const url = `https://api.x.com/2${path}`
  const params = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''))
  const qs = new URLSearchParams(params).toString().replace(/\+/g, '%20')
  const r = await fetch(qs ? `${url}?${qs}` : url, { headers: { authorization: oauthHeader('GET', url, { ...user(), params }) } })
  const j = await r.json()
  if (!r.ok) throw new Error(`X ${r.status}: ${JSON.stringify(j)}`)
  return j
}

export async function me() {
  return (await get('/users/me')).data
}

/** Replies and @mentions since `sinceId`, oldest first, with author usernames. */
export async function mentions(userId, sinceId) {
  const j = await get(`/users/${userId}/mentions`, {
    since_id: sinceId,
    max_results: '50',
    'tweet.fields': 'author_id,conversation_id,created_at,in_reply_to_user_id,referenced_tweets,public_metrics',
    expansions: 'author_id',
    'user.fields': 'username,public_metrics',
  })
  const users = Object.fromEntries((j.includes?.users ?? []).map((u) => [u.id, u]))
  return (j.data ?? []).reverse().map((t) => ({
    id: t.id,
    text: t.text,
    author: users[t.author_id]?.username ?? t.author_id,
    authorFollowers: users[t.author_id]?.public_metrics?.followers_count ?? 0,
    inReplyTo: t.referenced_tweets?.find((r) => r.type === 'replied_to')?.id ?? null,
    likes: t.public_metrics?.like_count ?? 0,
    at: t.created_at,
  }))
}

/** Our own latest posts with likes/replies/reposts/impressions, to learn what lands. */
export async function myPosts(userId) {
  const j = await get(`/users/${userId}/tweets`, { max_results: '20', 'tweet.fields': 'created_at,public_metrics' })
  return (j.data ?? []).map((t) => ({ id: t.id, text: t.text, at: t.created_at, ...t.public_metrics }))
}

/** v1.1 form POST; the form params are part of the OAuth 1.0a signature. */
async function postForm(path, params) {
  const url = `https://api.x.com/1.1${path}`
  const body = Object.entries(params).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&')
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: oauthHeader('POST', url, { ...user(), params }), 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`X ${r.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : {}
}

/** Profile fields: { name, description, url, location }; omit what should stay. */
export const updateProfile = (fields) => postForm('/account/update_profile.json', Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)))
export const updateAvatar = (png) => postForm('/account/update_profile_image.json', { image: png.toString('base64') })
export const updateBanner = (png) => postForm('/account/update_profile_banner.json', { banner: png.toString('base64') })

/**
 * Post. `opts` may be a reply-to id (old signature) or
 * { replyTo, quoteId, mediaIds, poll: { options: [..], minutes } }.
 */
export async function tweet(text, opts = {}) {
  if (typeof opts === 'string') opts = { replyTo: opts }
  const body = { text }
  if (opts.replyTo) body.reply = { in_reply_to_tweet_id: opts.replyTo }
  if (opts.quoteId) body.quote_tweet_id = opts.quoteId
  if (opts.mediaIds?.length) body.media = { media_ids: opts.mediaIds }
  if (opts.poll) body.poll = { options: opts.poll.options, duration_minutes: opts.poll.minutes ?? 1440 }
  const url = 'https://api.x.com/2/tweets'
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: oauthHeader('POST', url, user()), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`X ${r.status}: ${JSON.stringify(j)}`)
  return j.data // { id, text }
}

/** Upload a PNG for a post; returns the media id. */
export async function uploadImage(png) {
  const url = 'https://api.x.com/2/media/upload'
  const fd = new FormData()
  fd.append('media', new Blob([png], { type: 'image/png' }), 'image.png')
  fd.append('media_category', 'tweet_image')
  const r = await fetch(url, { method: 'POST', headers: { authorization: oauthHeader('POST', url, user()) }, body: fd })
  const j = await r.json()
  if (!r.ok || !j.data?.id) throw new Error(`X media ${r.status}: ${JSON.stringify(j).slice(0, 300)}`)
  return j.data.id
}

/** Recent original posts (no replies/reposts) from these accounts, with metrics and author info. */
export async function recentFrom(usernames) {
  const query = `(${usernames.map((u) => `from:${u}`).join(' OR ')}) -is:reply -is:retweet`
  const j = await get('/tweets/search/recent', {
    query,
    max_results: '25',
    'tweet.fields': 'created_at,public_metrics,author_id',
    expansions: 'author_id',
    'user.fields': 'username,public_metrics',
  })
  const users = Object.fromEntries((j.includes?.users ?? []).map((u) => [u.id, u]))
  return (j.data ?? []).map((t) => ({
    id: t.id,
    text: t.text,
    author: users[t.author_id]?.username ?? t.author_id,
    authorFollowers: users[t.author_id]?.public_metrics?.followers_count ?? 0,
    at: t.created_at,
    likes: t.public_metrics?.like_count ?? 0,
    replies: t.public_metrics?.reply_count ?? 0,
    reposts: t.public_metrics?.retweet_count ?? 0,
  }))
}

/** Look up accounts by username (max 100); unknown names are simply missing. */
export async function lookupUsers(usernames) {
  if (!usernames.length) return []
  const j = await get('/users/by', { usernames: usernames.slice(0, 100).join(','), 'user.fields': 'public_metrics,description' })
  return (j.data ?? []).map((u) => ({ id: u.id, username: u.username, followers: u.public_metrics?.followers_count ?? 0, bio: u.description ?? '' }))
}

/** Metrics for our posts by id (max 100 per call). */
export async function postMetrics(ids) {
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const j = await get('/tweets', { ids: ids.slice(i, i + 100).join(','), 'tweet.fields': 'public_metrics' })
    for (const t of j.data ?? []) out.push({ id: t.id, ...t.public_metrics })
  }
  return out
}

/** Our own follower / following counts. */
export async function myCounts() {
  return (await get('/users/me', { 'user.fields': 'public_metrics' })).data.public_metrics
}

export async function follow(sourceId, targetId) {
  const url = `https://api.x.com/2/users/${sourceId}/following`
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: oauthHeader('POST', url, user()), 'content-type': 'application/json' },
    body: JSON.stringify({ target_user_id: targetId }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`X follow ${r.status}: ${JSON.stringify(j).slice(0, 200)}`)
  return j.data
}
