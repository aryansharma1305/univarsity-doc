# Backup encryption and retention runbook

**Nothing here has been applied.** Today backups are manual and the VPS copies are plaintext.

## State on 2026-11-19 (read-only evidence)

- `systemctl list-timers` has no backup timer; root has no crontab; `/etc/cron.d` holds only
  `e2scrub_all`, `monarx-update`, `sysstat`.
- `$U/backups/` (0700 root): 6 plaintext sets `20261114T075844Z` … `20261118T122235Z`, 428–568 KB each;
  newest is ~26 h old at check time. Each contains `database.dump`, `objects/`, `secrets/` (copy of runtime
  secrets) etc. Sets from `20261117T205444Z` contain real student data.
- `/opt/docversity/app/.local/backups/20261110T160759Z` (staging-era, synthetic; see KNOWN-ISSUES).
- Off-server: the same 6 sets GPG-encrypted on the operator's Mac only.
- VPS tools: `gpg` present, `age` absent, so GPG is used (no new package; same custody key).
- Disk: 48% of 96 GB used.

`U=/opt/docversity/university-2efcea18-20261114/university`

## Design

1. `capture.sh` (unchanged rehearsed capture, scope text from `$SCOPE`) → plaintext set.
2. `encrypt-backup.sh <set>`: checks the set against `manifest.json`, refuses if the VPS keyring holds a
   secret key, streams `tar | gpg --encrypt` to the custody **public** key
   `E9E34ADEBC492B000736862C2936904343F7AF44` (encryption subkey `426C140C98519D12`), verifies that the
   ciphertext is addressed to exactly that subkey, writes `$U/backups-encrypted/<ts>.tar.gpg` + `.sha256`.
3. `pull-verify.sh` (operator Mac): copies new ciphertexts to `~/.docversity-recovery-vps/<ts>/`, checks
   the sha256, **decrypts with the custody key and checks every file against the manifest**, signs
   `SHA256SUMS`, then writes `<ts>.offsite-verified` (ciphertext sha256) on the VPS.
4. `prune-backups.sh` (dry run unless `--apply`): deletes a plaintext set only when its ciphertext
   exists, matches its checksum and the off-server marker names that same checksum. Keeps the newest
   14 encrypted sets on the VPS; older ones go only if verified off-server.

The private key never touches the VPS. A VPS compromise then exposes the live system (unavoidable) but
no longer the history of backups.

## Retention proposal (decision D4)

| Copy                               | Keep                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| VPS plaintext                      | none once verified off-server (normally < 24 h)                                   |
| VPS encrypted                      | newest 14 daily sets (~8 MB)                                                      |
| Mac (`~/.docversity-recovery-vps`) | 30 daily, then 1 per month for 12 months; pre-release captures 1 year             |
| Second custodian / second location | weekly copy of the newest verified set (needs the D3 custodian/location decision) |

Month/year thinning on the Mac is manual for now (shortcut: no script until volume justifies it).

## Gates

- [ ] G1 Operator approves writing to the VPS (`/opt/docversity/ops`, `/etc/docversity`, systemd units).
- [ ] G2 Custody key and its passphrase available on the Mac (`gpg --homedir … --list-secret-keys` shows `sec`).
- [ ] G3 A manual run of steps 2–4 below passes before the timer is enabled.
- [ ] G4 Deleting existing plaintext sets: separate explicit approval (one-time plan below).

## Apply

On the Mac, from the repo checkout:

```sh
G=~/.docversity-recovery-keys/gnupg-20261114
gpg --homedir "$G" --armor --export E9E34ADEBC492B000736862C2936904343F7AF44 >/tmp/custody-public.asc
scp -r deploy/ops root@189.72.149.93:/opt/docversity/ops.new
scp /tmp/custody-public.asc root@189.72.149.93:/root/custody-public.asc
```

On the VPS:

```sh
mv /opt/docversity/ops.new /opt/docversity/ops && chown -R root:root /opt/docversity/ops && chmod -R go-rwx /opt/docversity/ops
install -d -m 700 /etc/docversity /etc/docversity/backup-gnupg
gpg --homedir /etc/docversity/backup-gnupg --batch --import /root/custody-public.asc
gpg --homedir /etc/docversity/backup-gnupg --batch --with-colons --list-keys | grep -E '^(fpr|sub)' # expect fpr E9E34ADE…F7AF44, sub …426C140C98519D12
gpg --homedir /etc/docversity/backup-gnupg --batch --list-secret-keys | grep -c '^sec' # expect 0
# 2. one manual run (new capture + encrypt):
/opt/docversity/ops/backup/backup-daily.sh
```

On the Mac: `sh deploy/ops/backup/pull-verify.sh` → `verified off-server: <ts> …`.

On the VPS: `/opt/docversity/ops/backup/prune-backups.sh` (dry run; review the list).

Enable the schedule:

```sh
cp /opt/docversity/ops/backup/docversity-backup.{service,timer} /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now docversity-backup.timer
systemctl list-timers docversity-backup.timer
```

Run `pull-verify.sh` on the Mac at least weekly (daily during onboarding), then
`prune-backups.sh --apply` on the VPS.

## One-time plan for the existing plaintext sets (no deletion without approval)

1. Encrypt each of the 6 existing sets (does not modify them):
   `for d in $U/backups/20*Z; do /opt/docversity/ops/backup/encrypt-backup.sh "$d"; done`
2. Mac: `pull-verify.sh` verifies all 6 (decrypt + manifest). The older Mac copies in
   `~/.docversity-recovery/` stay untouched.
3. VPS: `prune-backups.sh` dry run lists the 6 sets → operator records approval → `--apply`.
4. Staging-era `/opt/docversity/app/.local/backups/20261110T160759Z`: not handled by the script; retire
   with the staging decommission (KNOWN-ISSUES #14) using the command recorded there, after approval.

Note: on ext4 `rm` does not overwrite blocks; the plaintext stays recoverable from the raw disk until
reused. Acceptable for this threat model (root on the VPS reads the live DB anyway).

## Rollback

```sh
systemctl disable --now docversity-backup.timer
rm -f /etc/systemd/system/docversity-backup.{service,timer} && systemctl daemon-reload
```

Encrypted sets and markers can stay (they only hold ciphertext). Plaintext sets already pruned are
recovered from the Mac copies (`ROLLBACK-AND-RECOVERY.md` §3). Removing the kit: `rm -r /opt/docversity/ops
/etc/docversity/backup-gnupg`.
