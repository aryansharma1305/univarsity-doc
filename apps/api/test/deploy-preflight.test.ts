import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../../deploy/scripts/vps-preflight.sh', import.meta.url));
const sha = 'a'.repeat(40);
function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
function preflight(
  options: {
    os?: string;
    version?: string;
    cpus?: number;
    memory?: number;
    disk?: number;
    dockerOk?: boolean;
    composeOk?: boolean;
    configOk?: boolean;
    gitStatusOk?: boolean;
    diskOk?: boolean;
    dirty?: boolean;
    tag?: string;
    host?: string;
    context?: string;
  } = {},
) {
  const folder = mkdtempSync(join(tmpdir(), 'synthetic-vps-preflight-'));
  const log = join(folder, 'calls');
  const shim = (name: string, code: string) => {
    writeFileSync(join(folder, name), `#!/bin/sh\n${code}\n`, { mode: 0o700 });
  };
  const print = (value: string) => `printf '%s\\n' ${quote(value)}`;
  try {
    shim('uname', print('Linux'));
    shim('getconf', print(String(options.cpus ?? 2)));
    shim('df', options.diskOk === false ? 'exit 2' : print('fixture filesystem'));
    shim(
      'awk',
      `case "$*" in *VERSION_ID*) ${print(options.version ?? '24.04')} ;; *MemTotal*) ${print(String(options.memory ?? 8388608))} ;; *NR*) ${print(String(options.disk ?? 104857600))} ;; *) ${print(options.os ?? 'ubuntu')} ;; esac`,
    );
    shim(
      'git',
      `case " $* " in *" rev-parse "*) ${print(sha)} ;; *" status "*) ${options.gitStatusOk === false ? 'exit 2' : print(options.dirty ? ' M synthetic-file' : '')} ;; *) exit 97 ;; esac`,
    );
    shim(
      'docker',
      `printf '%s\\n' "docker:$*" >> "$CALL_LOG"\ncase "$*" in 'context inspect'*) ${print('unix:///synthetic.sock')} ;; info) exit ${options.dockerOk === false ? 1 : 0} ;; 'compose version') exit ${options.composeOk === false ? 1 : 0} ;; *) exit 97 ;; esac`,
    );
    shim(
      'python3',
      `printf '%s\\n' "python:$*" >> "$CALL_LOG"\nexit ${options.configOk === false ? 1 : 0}`,
    );
    const result = spawnSync('/bin/sh', [script], {
      env: {
        PATH: `${folder}:/usr/bin:/bin`,
        HOME: folder,
        TMPDIR: folder,
        CALL_LOG: log,
        IMAGE_TAG: options.tag ?? sha,
        DOCKER_HOST: options.host ?? '',
        DOCKER_CONTEXT: options.context ?? '',
      },
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 16384,
    });
    if (result.error) throw result.error;
    return {
      status: result.status,
      output: result.stdout + result.stderr,
      calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
    };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe('non-mutating Hostinger preflight', () => {
  it('accepts the approved synthetic host and delegates canonical configuration validation without lifecycle commands', () => {
    const result = preflight();
    expect(result.status).toBe(0);
    expect(result.output).toContain('VPS preflight passed');
    expect(result.calls).toContain('check-config.py');
    expect(result.calls).not.toMatch(/(?:^|\s)(?:up|start|stop|rm|prune|build|pull)(?:\s|$)/);
  });
  it.each([
    [{ os: 'debian' }, 'Ubuntu 24.04'],
    [{ version: '22.04' }, 'Ubuntu 24.04'],
    [{ cpus: 1 }, 'two CPUs'],
    [{ memory: 6291455 }, '6 GiB'],
    [{ disk: 10485759 }, '10 GiB'],
    [{ dirty: true }, 'Dirty release'],
    [{ tag: 'b'.repeat(40) }, 'IMAGE_TAG'],
    [{ dockerOk: false }, 'Docker engine'],
    [{ composeOk: false }, 'Compose is unavailable'],
    [{ configOk: false }, 'Compose validation failed'],
    [{ gitStatusOk: false }, 'Unable to inspect checkout status'],
    [{ diskOk: false }, 'Unable to inspect release-filesystem space'],
  ] as const)('refuses an unsafe synthetic condition %#', (options, expected) => {
    const result = preflight(options);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(expected);
  });
  it('refuses remote Docker before contacting it and honors an explicitly selected local context', () => {
    const refused = preflight({ host: 'ssh://synthetic.example.invalid' });
    expect(refused.status).not.toBe(0);
    expect(refused.calls).toBe('');
    expect(
      preflight({ host: 'ssh://synthetic.example.invalid', context: 'synthetic-local' }).status,
    ).toBe(0);
  });
});
