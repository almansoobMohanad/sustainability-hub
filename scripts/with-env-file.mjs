// Runs a command with HUB_ENV_FILE set, e.g.
//   node scripts/with-env-file.mjs .env.supabase turbo dev
// The API then loads that settings file before its .env (see apps/api/src/env.ts).
// A script because `HUB_ENV_FILE=x command` doesn't work in Windows shells.
import { spawn } from 'node:child_process'

const [file, ...command] = process.argv.slice(2)
if (!file || command.length === 0) {
  console.error('Usage: node scripts/with-env-file.mjs <env file> <command...>')
  process.exit(1)
}

const child = spawn(command.join(' '), {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, HUB_ENV_FILE: file },
})
// Ctrl+C reaches the command too; wait for it to stop, then exit with its code
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
