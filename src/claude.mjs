import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

/**
 * One-shot call to the local Claude Code CLI, parsed as JSON.
 * No shell: through cmd.exe the empty --tools value is dropped.
 */
export function askClaude(prompt, { model = 'sonnet', timeoutMs = 240_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'json', '--model', model, '--max-turns', '1', '--tools', ''], { cwd: tmpdir() })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('claude timed out'))
    }, timeoutMs)
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`))
      try {
        const envelope = JSON.parse(out)
        const text = String(envelope.result ?? '')
        const start = text.search(/[[{]/)
        const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
        resolve({ value: JSON.parse(text.slice(start, end + 1)), costUsd: envelope.total_cost_usd ?? 0 })
      } catch (e) {
        reject(new Error(`could not read claude's answer: ${e.message}\n${out.slice(0, 400)}`))
      }
    })
    child.stdin.end(prompt)
  })
}
