/**
 * Cloud memory: 333's state (mind, watchlist, log tail) lives in a secret gist
 * so a fresh cloud runner can pick up exactly where the last one stopped.
 *
 *   node src/state.mjs pull     # gist -> data/
 *   node src/state.mjs push     # data/ -> gist
 *
 * Needs GIST_TOKEN and STATE_GIST in the environment.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const FILES = ['mind.json', 'watch.json', 'mind.log']
const api = (path, init = {}) =>
  fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.GIST_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', ...init.headers },
  })

export async function pull() {
  const r = await api(`/gists/${process.env.STATE_GIST}`)
  if (!r.ok) throw new Error(`state pull ${r.status}`)
  const g = await r.json()
  for (const name of FILES) {
    const f = g.files[name]
    if (!f) continue
    // Large files are truncated in the gist response; fetch the raw copy then.
    const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content
    writeFileSync(join(DATA, name), content)
  }
}

export async function push() {
  const files = {}
  for (const name of FILES) {
    if (!existsSync(join(DATA, name))) continue
    let content = readFileSync(join(DATA, name), 'utf8')
    if (name === 'mind.log') content = content.split('\n').slice(-3000).join('\n')
    files[name] = { content }
  }
  const r = await api(`/gists/${process.env.STATE_GIST}`, { method: 'PATCH', body: JSON.stringify({ files }) })
  if (!r.ok) throw new Error(`state push ${r.status}`)
}

if (process.argv[1] && process.argv[1].endsWith('state.mjs')) {
  const cmd = process.argv[2]
  if (cmd === 'pull') await pull()
  else if (cmd === 'push') await push()
  else throw new Error('usage: node src/state.mjs pull|push')
  console.log(`state ${cmd} ok`)
}
