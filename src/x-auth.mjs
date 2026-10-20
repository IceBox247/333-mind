/**
 * One-time login that lets NOCT post from its own X account. Two steps:
 *
 *   npm run x-auth               # prints + opens the authorize link
 *   npm run x-auth -- 1234567    # finish with the PIN X shows after Authorize
 *
 * Log in AS THE NOCT ACCOUNT before pressing Authorize. The access token is
 * saved to the Windows user env (NOCT_X_TOKEN / NOCT_X_SECRET); it is never
 * printed. The short-lived request token waits in data/.x-auth.json.
 */
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, exec } from 'node:child_process'
import { oauthHeader, me } from './x.mjs'

const pending = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', '.x-auth.json')
const pin = process.argv.slice(2).find((a) => !a.startsWith('--'))?.trim()

if (!pin) {
  const url = 'https://api.x.com/oauth/request_token'
  const r = await fetch(url, { method: 'POST', headers: { authorization: oauthHeader('POST', url, { extra: { oauth_callback: 'oob' } }) } })
  const t = new URLSearchParams(await r.text())
  if (!r.ok || !t.get('oauth_token')) throw new Error(`request_token failed (${r.status}). Check X_API_KEY / X_API_SECRET and that the app has Read and write permission.`)
  writeFileSync(pending, JSON.stringify({ token: t.get('oauth_token'), secret: t.get('oauth_token_secret') }))
  const link = `https://api.x.com/oauth/authorize?oauth_token=${t.get('oauth_token')}`
  console.log(`Log in as the NOCT account, press Authorize, then run: npm run x-auth -- <PIN>\n${link}`)
  if (!process.argv.includes('--no-open')) exec(`start "" "${link}"`)
} else {
  if (!existsSync(pending)) throw new Error('No login in progress. Run npm run x-auth first.')
  const { token, secret } = JSON.parse(readFileSync(pending, 'utf8'))
  const url = 'https://api.x.com/oauth/access_token'
  const params = { oauth_verifier: pin }
  const r = await fetch(`${url}?${new URLSearchParams(params)}`, { method: 'POST', headers: { authorization: oauthHeader('POST', url, { token, tokenSecret: secret, params }) } })
  const t = new URLSearchParams(await r.text())
  if (!r.ok || !t.get('oauth_token')) throw new Error(`access_token failed (${r.status}). Wrong or expired PIN? Run npm run x-auth again.`)
  for (const [k, v] of [['NOCT_X_TOKEN', t.get('oauth_token')], ['NOCT_X_SECRET', t.get('oauth_token_secret')]]) {
    execFileSync('powershell', ['-NoProfile', '-Command', `[Environment]::SetEnvironmentVariable('${k}', $env:V, 'User')`], { env: { ...process.env, V: v } })
    process.env[k] = v
  }
  rmSync(pending)
  console.log(`Connected as @${(await me()).username}. 333 will post from this account.`)
}
