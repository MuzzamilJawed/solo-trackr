---
name: dev-workflow
description: SoloTrackr dev environment facts and repo etiquette (ports, Node, builds, what not to commit). Use at the start of work on this repo or before building/committing.
---

# Dev workflow

- Next.js 16 dev (Turbopack) on **port 3005**; Node 20.19.5 (Capacitor CLI 8 wants ≥ 22 — nvm v24.14.1 folder lacks node.exe). `.next` is the dev dir: build to another dir with `NEXT_DIST_DIR=.next-xyz` (ignored via `/.next-*/`) so you never clobber the running dev server's cache. If dark-mode CSS looks stale: `rm -rf .next && npm run dev`.
- Windows + Git Bash: Python/heredoc quoting breaks easily — write scripts to a file. `javac`/`java` need Windows paths (`cygpath -w`).
- Commit per logical feature; end commit messages with the Co-Authored-By trailer the session asks for. Only commit/push when asked. Leave the user's own uncommitted files alone unless told.
- Generated and git-ignored: `android/app/src/main/assets/*`, `.next*`, `tsconfig.tsbuildinfo`, `playwright-report/`, JVM crash dumps (`hs_err_pid*`, `replay_pid*`).
- Repo docs: keep the `.md` guides in the root (user decision); generated `.txt` status files were removed.
- Android: see the `android-splash` skill; Studio builds the APK (Build > Build APK, or run on device).
