# Accounts, Sign-In & Per-User Data

Every screen in SoloTrackr now sits behind an account. Watchlists, the portfolio
ledger and the dashboard's "watch any asset" list belong to the signed-in user,
so two people using the same server never see each other's data.

---

## Signing in for the first time

An **admin account is seeded automatically** the first time the app connects to
MongoDB. Start the app and sign in with:

| | |
|---|---|
| Email | `admin@solotrackr.app` |
| Password | `admin12345` |

Override these with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME`
in `.env` **before** the first run. **Change the password before deploying.**

Anyone else can create their own account from the *Create Account* tab on
`/login` — new accounts get the `user` role and start with an empty workspace.

The sign-up form collects **name, email, phone number, password and a verify-
password confirmation**. The phone number is required on this form and stored
normalised (formatting stripped, a leading `+` kept — `+92 300 123-4567` becomes
`+923001234567`). Google sign-up never asks for one, so the field is optional on
the account itself; those users can add it later from `/profile`.

Every password field in the app has a show/hide eye toggle.

**One account per email address.** Sign-up is refused with *"An account with this
email already exists — sign in instead."* if the address is taken. The rule is
case- and whitespace-insensitive — `  Foo@Example.COM ` is the same account as
`foo@example.com`, because addresses are trimmed and lower-cased before they are
stored. It is enforced by a **unique index in MongoDB**, not just by a lookup in
the sign-up route, so two simultaneous sign-ups can't both slip through; the
loser gets the same message rather than a server error. The index is (re)built
on every start-up, and if a legacy database already holds duplicate addresses
the log says so instead of quietly running without the constraint.

The one case where an existing email doesn't stop you: an account created
through **Google that has no password yet** adopts the password you just typed
and gains email sign-in. That links the two sign-in methods on one account — it
never creates a second one.

---

## Forgot your password — `/forgot-password`

The sign-in form carries a **Forgot password?** link. Recovery is a one-time
code followed by a single-use link:

1. **Give the email address** on the account. Email is the only channel — no
   SMS provider is wired up, and a phone box that silently can't deliver is
   worse than not offering one. (The API still calls the field `identifier`,
   so an SMS channel could be added later without changing its shape.)
2. **Enter the 6-digit code** sent to that address. It is valid for **10
   minutes** and dies after **5 wrong guesses**. Codes can be re-sent after a
   45-second cool-down.
3. **Set the new password** on the reset link the verified code mints. The link
   is good for **15 minutes**, works **once**, and is invalidated by starting
   another reset. Afterwards you're sent back to `/login` to sign in with it.

A Google-only account can reset this way too — doing so gives it a password and
enables email sign-in, exactly like setting one from `/profile`.

**What it deliberately doesn't do**

- **Never says whether an account exists.** An unknown address gets the same
  "code sent" response, with a throwaway request handle whose code can never
  match. Otherwise this endpoint would be a membership oracle.
- **Never stores anything replayable.** Only HMACs of the code and of the link
  token are written; a leaked `passwordresets` collection can't take an account
  over.
- **Rate-limits every step** — 5 codes per address and 15 per IP address per
  quarter hour, and separate caps on verifying and on submitting a new password.
  The counter lives in server memory, which is right for the single-server
  deployment this app expects; behind more than one instance, move it into
  MongoDB.
- **Does not sign other devices out.** Session cookies are stateless and carry
  no revocation handle, so a session opened before the reset stays valid until
  it expires. Changing `AUTH_SECRET` is the blunt instrument that ends all of
  them.

### Delivering the code

Nothing is delivered until a provider is configured — see the table below for
`RESEND_API_KEY` + `MAIL_FROM`, or `NOTIFY_WEBHOOK_URL` to send it yourself.
Both are plain HTTPS calls, so no new package is involved.

With **neither** configured, a `next dev` server prints the code to the terminal
and shows it on the verify screen, so the flow is testable before any provider
account exists. A production build refuses to send instead — a code nobody
receives is worse than an honest error.

---

## My Profile — `/profile`

Every signed-in user gets their own account screen:

- **Identity** — avatar, name, email, role, which sign-in methods are linked,
  when they joined and when they last signed in.
- **Activity** — watchlists, symbols tracked, trades recorded, instruments
  traded, assets on the dashboard watch list, and the span of their trading.
- **Account details** — display name and phone number are editable (the phone
  can also be cleared). The sidebar chip updates immediately.
- **Password** — change it, or *set* one for the first time if the account was
  created through Google (which then enables email sign-in too).

Email and role aren't self-editable: the email identifies the account and is
what Google matches on, and the role is an administrator's decision.

---

## User Management — `/admin/users` (admins only)

The link appears in the sidebar only for administrators, and the page and its
APIs both refuse anyone else.

- **Directory** of every registered account — avatar, name, email, role,
  linked sign-in methods, watchlist/symbol/trade counts, join date and last
  sign-in. Searchable by name or email; sortable by newest, recently active,
  name or most trades.
- **Detail drawer** — click any row for that account's full activity roll-up and
  a summary of their watchlists (names, market type and size).
- **Role management** — promote a user to admin or demote them back.

Two things this deliberately does **not** do: an admin cannot read another
user's holdings or watchlist contents (only names and counts), and there is no
delete-user action.

**Guard rails on role changes**

- You can't remove your own administrator access.
- At least one administrator must always remain.
- The admin role is re-read from the database on every admin request, so
  demoting someone revokes their access immediately — they don't keep it until
  their session cookie expires.

---

## Google sign-in

The Google button only appears once a client ID is configured.

1. Open the [Google Cloud credentials page](https://console.cloud.google.com/apis/credentials).
2. **Create credentials → OAuth client ID → Web application.**
3. Under **Authorized JavaScript origins**, add every origin the app is served
   from — e.g. `http://localhost:3005` for development and your HTTPS domain in
   production.
4. Copy the client ID into `.env`:

   ```env
   GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   ```

5. Restart the dev server.

Signing in with Google on an email that already has a password account links the
two — it's still one user, with one set of watchlists and one ledger.

> **Capacitor note:** Google Identity Services will only render on an origin
> listed above. The native shell loads your deployed server, so add that exact
> origin. Email/password sign-in works everywhere regardless.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Database connection. |
| `AUTH_SECRET` | **in production** | Signs the session cookie. Without it the app falls back to a known development secret and sessions can be forged. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. |
| `GOOGLE_CLIENT_ID` | no | Enables the Google sign-in button. |
| `COOKIE_SECURE` | no | Set to `false` to allow the session cookie over plain HTTP in a production build (LAN / Capacitor dev). |
| `SEED_ADMIN_EMAIL` · `SEED_ADMIN_PASSWORD` · `SEED_ADMIN_NAME` | no | Override the seeded admin. |
| `APP_URL` | no | Public origin used to build the password-reset link. Derived from the request when unset — set it behind a proxy or for the Capacitor shell. |
| `RESEND_API_KEY` · `MAIL_FROM` | for reset codes | Emails the reset code through [Resend](https://resend.com). `MAIL_FROM` must sit on a domain verified there. |
| `NOTIFY_WEBHOOK_URL` · `NOTIFY_WEBHOOK_TOKEN` | no | Send it yourself instead: receives `POST {channel,to,subject,text,html,code}` when no Resend key is set. |

Changing `AUTH_SECRET` signs everyone out; it does not affect stored passwords.

---

## What happens to data from before accounts existed

Nothing is lost:

- **Watchlists** already in MongoDB are adopted by the seeded admin on the first
  connection after upgrading, so signing in as the admin shows them exactly as
  before.
- **Portfolio trades and the universal watch list** used to live in the
  browser's `localStorage`. The first time you sign in on that browser they're
  uploaded into your account and the local copies are dropped. The import only
  runs when the account is still empty, so it can't duplicate or overwrite
  anything already on the server.

---

## How it works

Hand-rolled and dependency-free — nothing beyond what the project already used.

| Piece | File |
|---|---|
| Password hashing (scrypt, `node:crypto`) | `app/lib/password.ts` |
| Phone normalisation + validation | `app/lib/phone.ts` |
| Reset codes + link tokens (HMAC, masking) | `app/lib/otp.ts` |
| Code delivery — Resend / webhook | `app/lib/notify.ts` |
| In-memory request throttle | `app/lib/rateLimit.ts` |
| Reset APIs — request · verify · reset | `app/api/auth/password-reset/*/route.ts` |
| Forgot-password screen (email + code) | `app/forgot-password/page.tsx` |
| Reset link screen (new password) | `app/reset-password/page.tsx` |
| Six-box one-time-code input | `app/components/OtpInput.tsx` |
| Password input with show/hide toggle | `app/components/PasswordField.tsx` |
| Session cookie (HMAC-SHA256, 30 days, httpOnly) | `app/lib/session.ts` |
| Google ID-token verification | `app/lib/google.ts` |
| `requireUser()` guard for route handlers | `app/lib/apiAuth.ts` |
| Admin seed + unique-email index + legacy-data adoption | `app/lib/seed.ts` |
| `requireAdmin()` guard (re-reads the role from the DB) | `app/lib/apiAuth.ts` |
| Per-user activity roll-ups | `app/lib/userStats.ts` |
| Client auth state | `app/context/AuthContext.tsx` |
| Sign-in / sign-up screen | `app/login/page.tsx` |
| Profile screen | `app/profile/page.tsx` |
| Admin user directory | `app/admin/users/page.tsx` |
| Route gate (`/login` redirect, `/admin/*` block) | `app/components/AppShell.tsx` |

**Data model** — `User`, `Transaction`, `Watchlist` and `PasswordReset`
(`app/models/`). `Transaction` and `Watchlist` both carry an indexed `userId`;
`PasswordReset` carries a TTL index, so finished and abandoned reset attempts
drop out of the collection on their own.

**The isolation rule:** every user-scoped query filters on `userId` taken from
the session cookie, never from the request body. A watchlist or trade belonging
to someone else returns `404`, and unauthenticated API calls return `401`.
