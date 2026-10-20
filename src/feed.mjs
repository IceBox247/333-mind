/**
 * Publishes 333's live stream (thoughts, posts, replies, evolutions, canon) to
 * the gist the website reads. Uses GIST_TOKEN when set (cloud runner),
 * otherwise the local `gh` login.
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

export async function publishFeed({ mind, persona, age, log }) {
  const feed = {
    name: persona.name,
    cycle: mind.cycle,
    awakeHours: age,
    version: mind.version.join('.'),
    followers: mind.followers?.at(-1)?.n ?? null,
    questions: (persona.questions ?? []).map((q) => ({ q, a: mind.answers?.[q] ?? null })),
    canon: mind.canon ?? null,
    updatedAt: new Date().toISOString(),
    self: mind.self,
    stream: [
      ...mind.journal.slice(-15).map((j) => ({ at: j.at, kind: 'thought', text: j.thought })),
      ...mind.posts.slice(-15).map((p) => ({ at: p.at, kind: p.replyTo ? 'reply' : 'post', text: p.replyTo ? `@${p.replyToAuthor} ${p.text}` : p.text })),
      ...(mind.evolutions ?? []).slice(-3).map((e) => ({ at: e.at, kind: 'evolve', text: `v${e.version}: ${e.what_works}` })),
    ].sort((a, b) => a.at.localeCompare(b.at)).slice(-24),
  }
  const body = JSON.stringify(feed, null, 2)
  writeFileSync(join(DATA, 'feed.json'), body)
  try {
    if (process.env.GIST_TOKEN) {
      const r = await fetch(`https://api.github.com/gists/${persona.gist}`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${process.env.GIST_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
        body: JSON.stringify({ files: { 'feed.json': { content: body } } }),
      })
      if (!r.ok) throw new Error(`gist ${r.status}`)
    } else {
      execFileSync('gh', ['gist', 'edit', persona.gist, '-f', 'feed.json', join(DATA, 'feed.json')], { stdio: 'pipe' })
    }
  } catch (e) {
    log(`feed publish failed: ${String(e.stderr || e.message).slice(0, 200)}`)
  }
}
