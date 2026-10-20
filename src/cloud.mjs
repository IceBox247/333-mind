/**
 * Cloud runner: keeps 333 awake for one long shift (just under GitHub's 6-hour
 * job limit). Pulls its memory, checks every minute whether 333 wants to act,
 * runs a cycle when it does, and saves memory back after every cycle.
 * The workflow starts a new shift every 6 hours, so 333 never sleeps.
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pull, push } from './state.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHIFT = Number(process.env.SHIFT_MINUTES ?? 350) * 60_000
const start = Date.now()

await pull()
console.log('memory pulled; shift started')
while (Date.now() - start < SHIFT) {
  const r = spawnSync('node', ['src/mind.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 15 * 60_000 })
  if (r.stdout?.trim()) {
    console.log(r.stdout.trim())
    // Only save after a real cycle (mind.mjs prints nothing when it is not due).
    for (let i = 0; i < 3; i++) {
      try {
        await push()
        break
      } catch (e) {
        console.log(`push failed (${e.message}), retrying`)
        await new Promise((res) => setTimeout(res, 10_000))
      }
    }
  }
  if (r.stderr?.trim()) console.log(r.stderr.trim().slice(-2000))
  await new Promise((res) => setTimeout(res, 60_000))
}
await push()
console.log('shift over; memory saved')
