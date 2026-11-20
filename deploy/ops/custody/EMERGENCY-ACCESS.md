# Recovery-key custody and emergency access

Today one person (the operator) holds every recovery secret on one Mac (KNOWN-ISSUES #1–#3). This
procedure adds a **second custodian** and break-glass steps. Nothing here has been done yet.

## What must be recoverable

| Secret                              | Today                                                                     | Loss means                                        |
| ----------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| SSH access to the VPS               | 1 key `docversity-deploy` (`SHA256:yYvIZGwQ…Je3o`) on root; no other user | console-only access (Hostinger, unverified)       |
| Hostinger account (hPanel, console) | operator's account + MFA                                                  | no console, no rescue, no billing                 |
| GPG custody key `E9E34ADE…F7AF44`   | `~/.docversity-recovery-keys/gnupg-20261114` + passphrase file, one Mac   | every off-server backup unreadable                |
| iCloud passphrase (MFA key copy B)  | operator's password manager                                               | copy B unusable (copy A inside backups remains)   |
| `STAFF_MFA_ENCRYPTION_KEY`          | VPS `secrets/runtime`, backups (copy A), iCloud (copy B)                  | every enrolled staff member needs an access reset |

## Do now (before the custodian handover)

**Move the GPG custody passphrase file off the Mac.** Today the passphrase file (referenced by
`custody-20261114.json` `passphraseFile`) sits on the same Mac as the key, so whoever has the Mac (or
a backup of its disk) can open every backup. Put the passphrase into the password manager (operator
vault, later shared with the custodian), check it unlocks the key once
(`gpg --homedir ~/.docversity-recovery-keys/gnupg-20261114 --pinentry-mode loopback --dry-run --sign /dev/null`
with the passphrase typed), then delete the file and update `passphraseFile` in the custody record to
"password manager". `pull-verify.sh` then asks for it through pinentry (no `DV_PASSPHRASE_FILE`).
Operator action; not done by this change.

## Second custodian (decision D3: who)

A named person at the institution or a trusted co-operator, reachable within 24 h, with a password
manager that supports secure sharing and a hardware security key (recommended).

### One-time handover (operator + custodian, in person or on a video call; ~1 h)

1. **SSH.** The custodian creates their own key on their machine (never copied):
   `ssh-keygen -t ed25519 -a 100 -C "docversity-<name>" -f ~/.ssh/docversity_<name>` (passphrase on).
   They send only the `.pub` line. The operator installs it for the sudo user (ssh/RUNBOOK.md step 1,
   appended to `/home/dvops/.ssh/authorized_keys` or a second user), records the fingerprint
   (`ssh-keygen -lf`) in the custody record, and the custodian tests
   `ssh -i ~/.ssh/docversity_<name> dvops@189.72.149.93 'sudo -v && echo OK'`.
2. **Hostinger.** Add the custodian as a team member / delegated access in hPanel (not a shared
   password), confirm they can open the VPS console (gate G1 of the SSH runbook). If delegation is not
   available: the hPanel credentials + MFA recovery codes go into the shared password-manager vault.
3. **GPG custody key.** Export once, protected by its own passphrase, on the operator's Mac
   (Terminal, not an agent):
   ```sh
   G=~/.docversity-recovery-keys/gnupg-20261114
   gpg --homedir "$G" --armor --export-secret-keys E9E34ADEBC492B000736862C2936904343F7AF44 >docversity-custody-secret.asc
   shasum -a 256 docversity-custody-secret.asc
   ```
   The file is still protected by the key's passphrase. Store the file in the shared vault (or an
   encrypted USB drive kept by the custodian), and the passphrase **separately** (different vault item
   or sealed envelope). Delete the export from the Mac (`rm -P` or Finder secure delete is not reliable
   on APFS: keep the file inside an encrypted container instead).
   The custodian proves it works on their machine with a throwaway GNUPGHOME:
   `G=$(mktemp -d); gpg --homedir "$G" --import docversity-custody-secret.asc; gpg --homedir "$G" --decrypt <some recovery.tar.gpg> | tar -tf - | head -3; rm -rf "$G"`
   (lists file names only).
4. **iCloud passphrase.** Share the password-manager item for
   `staff-mfa-key-20261118T121516Z.txt.gpg` with the custodian. Custodian runs the fingerprint check
   from ROLLBACK-AND-RECOVERY.md §4 (expect `5e3dec450a9dc3c9`), which prints no secret.
5. **Backups.** Give the custodian a copy of the newest verified encrypted set (weekly thereafter;
   backup/RUNBOOK.md retention, second location).
6. **Record** (`phase1-release/custody-<date>.json`, no secrets): custodian name, SSH key fingerprint,
   vault item names, date of each successful test, and the updated custody scope (real student data —
   KNOWN-ISSUES #13). Both sign off.

Repeat tests every 6 months and after any key rotation. When a custodian leaves: remove their SSH key,
Hostinger delegation and vault sharing the same day; rotate the GPG custody key if the export was ever
outside the vault (new key, re-encrypt new backups, keep old key for old sets).

## Break-glass

Use when the operator is unreachable and production needs action, or the operator's Mac is lost.

1. **Decide and log.** Two people (custodian + institution security contact) agree; note time and
   reason in the incident log. Do not change application data unless the incident requires it.
2. **Get a shell.** `ssh -i ~/.ssh/docversity_<name> dvops@189.72.149.93`, then `sudo -i`. If SSH fails:
   Hostinger hPanel → VPS → console / recovery mode, log in as root with the console password from the
   vault. If sshd is the problem: `rm /etc/ssh/sshd_config.d/00-docversity-hardening.conf; sshd -t &&
systemctl reload ssh` (SSH runbook rollback).
3. **Read state** (no changes): `docker compose -p docversity-university-407e5ed2 -f
/opt/docversity/university-2efcea18-20261114/university/compose.json ps`; `journalctl -u
docversity-healthcheck -n 50`; `df -h /`.
4. **Act only with the runbooks**: web/api rollback (ROLLBACK-AND-RECOVERY.md §1–2), restore
   (§3, isolated first), MFA key recovery (§4) with the custodian's iCloud passphrase or a decrypted
   backup.
5. **Lost or stolen operator Mac.** Treat it as a full compromise of everything on it. While the
   passphrase file is still on the Mac (see "Do now"), the GPG key protects nothing: assume every
   backup set and the runtime secrets inside them (`secrets/runtime`: `SESSION_SECRET`,
   `STAFF_MFA_ENCRYPTION_KEY`, DB/Redis/MinIO credentials) are readable by the thief.
   - Access: confirm the custodian key works, then remove `docversity-deploy` from
     `/root/.ssh/authorized_keys`; revoke the Mac's sessions (Hostinger, GitHub, iCloud, password
     manager device).
   - Backup key: create a new custody key on a clean machine, import only its public key into
     `/etc/docversity/backup-gnupg` (update the pinned fingerprint in `encrypt-backup.sh` by a PR),
     take a fresh capture and encrypt it to the new key. Old ciphertexts stay readable to the thief:
     delete the VPS copies encrypted to the old key once new verified sets exist; keep off-server old
     sets only where the custodian holds them and they are needed.
   - Runtime secrets (planned, approved maintenance window, fresh backup first): rotate the DB, Redis
     and MinIO passwords and `SESSION_SECRET` (all sessions and open activation codes become invalid;
     reissue codes); rotate `STAFF_MFA_ENCRYPTION_KEY` (enrolled staff need an access reset and
     re-enrolment, unless a re-encryption migration exists by then). Then a new capture, encrypted to
     the new key, and destroy the iCloud copy B of the old MFA key.
6. **Afterwards**: rotate anything exposed, write the incident note, re-run the custody tests.
