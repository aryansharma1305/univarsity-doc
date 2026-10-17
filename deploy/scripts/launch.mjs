import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
// Secrets are injected at runtime, never build arguments or Compose interpolation.
const file = process.env.RUNTIME_ENV_FILE ?? '/run/secrets/runtime';
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const split = line.indexOf('=');
  if (split < 1) throw new Error('Invalid runtime secret format');
  process.env[line.slice(0, split)] = line.slice(split + 1);
}
const child = spawn(process.argv[2], process.argv.slice(3), { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', () => {
  console.error('Unable to start service');
  process.exit(1);
});
