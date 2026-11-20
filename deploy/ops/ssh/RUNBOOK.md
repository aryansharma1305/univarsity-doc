# SSH hardening runbook

Applies `00-docversity-hardening.conf` to the production VPS (`189.72.149.93`, Ubuntu 24.04, OpenSSH
9.6p1). **Nothing here has been applied.** Every step needs operator approval.

## State on 2026-11-19 (read-only evidence)

| Item                                     | Value                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sshd -T` `passwordauthentication`       | `yes` (`50-cloud-init.conf` is read before `60-cloudimg-settings.conf`, first value wins)                              |
| `permitrootlogin`                        | `yes`                                                                                                                  |
| `kbdinteractiveauthentication`           | `no`                                                                                                                   |
| `authenticationmethods` / `maxauthtries` | `any` / `6`                                                                                                            |
| `x11forwarding` / `allowagentforwarding` | `yes` / `yes`                                                                                                          |
| Accounts with a login shell              | `root` only. **No non-root sudo user exists**; `/home` has no `.ssh` directories                                       |
| `/root/.ssh/authorized_keys`             | 1 key: `SHA256:yYvIZGwQkronlG3/dSDu2AOXp5oou9chf2/YSd/Je3o docversity-deploy (ED25519)`                                |
| sudoers                                  | `%sudo ALL=(ALL:ALL) ALL`, `%admin` same; groups `sudo`, `admin` have no members; `90-cloud-init-users`: root NOPASSWD |
| ufw                                      | active, default deny incoming; 22, 80, 443 open to any                                                                 |
| ssh journal, last 7 days                 | `Failed password` 1,692 · `Invalid user` 1,264 · `Accepted publickey` 399 · `Accepted password` 0                      |
| Service                                  | `ssh.socket` active + enabled, `ssh.service` active (socket-activated)                                                 |

## Why `PermitRootLogin prohibit-password` now, `no` later

- `prohibit-password` removes the actual risk today (password guessing against root: 1,692 attempts a
  week) while keeping the one working path: the `docversity-deploy` key on root, which every release
  script, runbook and the agent tooling use (`ssh root@…`).
- `no` would lock out that key and all existing scripts at once, while no other account exists. It is
  phase B: after a sudo user has done one full release/backup cycle, scripts are switched to
  `sudo`, and a second key exists. Then set `PermitRootLogin no` through the same gates.

## Gates (all must be ticked by a human, in this order)

- [ ] **G1 — Provider console works without SSH.** A human logs in to Hostinger hPanel → VPS → and
      confirms a console that does not depend on sshd (the browser/VNC "Emergency console" or "Recovery
      mode") reaches a root shell, and knows the root console password. If the hPanel "Browser terminal"
      is an SSH-with-password client it will **stop working** after this change, so it does not count.
      Record who checked and when.
- [ ] **G2 — Non-root sudo user with key-only access, tested from the operator's machine** (steps 1-2).
- [ ] **G3 — Second key / second custodian**: at least two distinct authorized keys across root and
      the sudo user (see `../custody/EMERGENCY-ACCESS.md`).
- [ ] **G4 — `sshd -t` passes and `sshd -T` shows the expected values** with the file in place (step 4).
- [ ] **G5 — An existing root session stays open** for the whole change and until step 6 passes in
      a separate terminal.

## Apply

Session A (keep open throughout):

```sh
ssh root@189.72.149.93
```

1. Create the sudo user (name `dvops` is a proposal; decision D1). Session A:

   ```sh
   adduser --disabled-password --gecos 'Docversity operator' dvops
   usermod -aG sudo dvops
   install -d -m 700 -o dvops -g dvops /home/dvops/.ssh
   # Paste the PUBLIC key (one line, ssh-ed25519 …) of the operator's new key:
   install -m 600 -o dvops -g dvops /dev/stdin /home/dvops/.ssh/authorized_keys
   ssh-keygen -lf /home/dvops/.ssh/authorized_keys
   passwd dvops   # sudo password (store in the password manager); not usable for SSH after step 5
   ```

2. From the operator's Mac, a **new** terminal (G2):

   ```sh
   ssh -o IdentitiesOnly=yes -i ~/.ssh/dvops_ed25519 dvops@189.72.149.93 'id && sudo -v && sudo sshd -T | grep -c .'
   ```

   Must print `uid=…(dvops)… groups=…(sudo)` and a number after the sudo password prompt.

3. Copy the drop-in to the VPS (from the repo checkout on the Mac):

   ```sh
   scp deploy/ops/ssh/00-docversity-hardening.conf root@189.72.149.93:/root/00-docversity-hardening.conf
   ```

4. Session A — install and validate (G4):

   ```sh
   install -m 644 -o root -g root /root/00-docversity-hardening.conf /etc/ssh/sshd_config.d/00-docversity-hardening.conf
   sshd -t && echo SYNTAX_OK
   sshd -T | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|authenticationmethods|maxauthtries|x11forwarding|allowagentforwarding) '
   ```

   Expect `passwordauthentication no`, `kbdinteractiveauthentication no`,
   `permitrootlogin prohibit-password` (some builds print the alias `without-password`), `authenticationmethods publickey`,
   `maxauthtries 6`, `x11forwarding no`, `allowagentforwarding no`. If `sshd -t` fails: `rm` the file, stop.

5. Session A — reload (existing sessions are not dropped):

   ```sh
   systemctl reload ssh && systemctl is-active ssh
   ```

6. From the Mac, new terminals, **while session A stays open**:

   ```sh
   ssh root@189.72.149.93 true && echo ROOT_KEY_OK
   ssh -o IdentitiesOnly=yes -i ~/.ssh/dvops_ed25519 dvops@189.72.149.93 true && echo DVOPS_KEY_OK
   ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password,keyboard-interactive root@189.72.149.93 true
   # expected: "Permission denied (publickey)."
   ```

   Then run the commands the release scripts actually use (deployment runbook), still from new
   terminals, with the operator's normal `~/.ssh/config` (add `IdentitiesOnly yes` for this host if the
   agent holds many keys):

   ```sh
   ssh -o BatchMode=yes root@189.72.149.93 'docker compose -p docversity-university-407e5ed2 -f /opt/docversity/university-2efcea18-20261114/university/compose.json ps --format "{{.Service}} {{.Status}}"'
   scp -o BatchMode=yes deploy/ops/README.md root@189.72.149.93:/root/ssh-hardening-scp-test && ssh root@189.72.149.93 'rm /root/ssh-hardening-scp-test'
   ```

   Both must work non-interactively (as the release scripts do). Only after all of this behaves as
   expected close session A.

## Rollback

From session A, the sudo user, or the provider console (G1):

```sh
rm -f /etc/ssh/sshd_config.d/00-docversity-hardening.conf
sshd -t && systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|permitrootlogin) '   # back to: yes / yes
```

The sudo user can stay (harmless) or be removed with `deluser --remove-home dvops`.

## Not changed here (decisions)

- `AllowTcpForwarding` stays default (`yes`): operators may use `ssh -L` for diagnostics. Set `no` once
  confirmed unused.
- No `AllowUsers` line: a typo locks everyone out. Optional later: `AllowUsers root dvops`.
- Port 22 stays open to any address in ufw; restricting by source IP is impractical without a static
  operator IP. Optional: `fail2ban` (new package, separate approval).
