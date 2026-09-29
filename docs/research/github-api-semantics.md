# GitHub API and auth semantics for a static SPA

Research for issue [#7](https://github.com/DurgaPrasadReddyV/prize-distributor/issues/7).
Branch: `research/github-api-semantics`.

## How these findings were gathered

Two kinds of evidence appear below, and they are labelled:

- **Documented** — a claim taken from primary GitHub documentation, with the URL.
- **Observed** — a claim established by calling the live API against this repository
  (`DurgaPrasadReddyV/prize-distributor`, public) on 2026-09-29. Where the docs are
  ambiguous or silent, the observation settles it.

The distinction matters, because on the most important question in this document
(Q1) the documentation is ambiguous and the observation contradicts the
expectation the ticket started from.

---

## Q1. Authorisation requirements of `GET /repos/{owner}/{repo}/collaborators/{username}/permission`

### Can a user WITHOUT push access call it?

- **Documented.** The endpoint appears in the fine-grained permissions reference under
  *Repository permissions for "Metadata"* with access level `read`, for both user access
  tokens (UAT) and installation access tokens (IAT), and with no "Additional Permissions"
  requirement. <https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps#repository-permissions-for-metadata>
- **Documented.** The endpoint is listed in the OpenAPI description with the same
  `Metadata: read` classification.
  <https://github.com/github/rest-api-description>
- **Documented.** An unauthenticated call is refused: observed status `401`
  "Requires authentication" (see "Observed" block below). So a token is required, but
  not necessarily one belonging to a person with push access.
- **Documented.** The sibling endpoints in the same family are stricter.
  `GET /repos/{owner}/{repo}/collaborators` requires "write, maintain, or admin
  privileges on the repository", and `GET /repos/{owner}/{repo}/collaborators/{username}`
  requires "push access to the repository", both needing `read:org` and `repo` scopes
  for OAuth app tokens. <https://docs.github.com/en/rest/collaborators/collaborators>
  The `/permission` variant carries **no** such push-access requirement — it is the
  odd one out in this family, and the cheapest of the three.

**So: yes, a user without push access can call it**, provided they hold a token
authorised for the repository at the `Metadata: read` level. The endpoint is not
self-enforcing in the way the ticket hoped.

### What does it return for a user who is not a collaborator?

This is the crux, and here the answer is **neither** of the two options the ticket
posed.

- **Documented.** The response schema is `{ permission, role_name, user }`, where
  `permission` "provides the legacy base roles of `admin`, `write`, `read`, and `none`",
  and `role_name` "provides the name of the assigned role, including custom roles".
  <https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permission-for-a-user>
- **Documented.** Documented status codes are `200` ("if user has admin permissions")
  and `404` ("Resource not found"). The `200` description is self-contradictory and is
  a long-standing documentation artefact; the `permission` value it returns is plainly
  not limited to admins, as shown below.

**Observed** — called live against this repository as the repo owner:

| Probe | Status | `permission` | `role_name` | `user.permissions.push` |
|---|---|---|---|---|
| Unauthenticated, any username | `401` | — | — | — |
| Owner (real collaborator) | `200` | `admin` | `admin` | `true` |
| `torvalds` (a real GitHub user, **not** a collaborator) | `200` | `read` | `read` | `false` |
| `octocat` (a real GitHub user, not a collaborator) | `404` via sibling endpoint | — | — | — |
| Non-existent username `this-user-should-not-exist-zzq8812` | `404` | — | — | — |

The decisive result: **a non-collaborator gets HTTP `200` with `permission: "read"`,
not a refusal, and not `"none"`.** The `404` is reserved for usernames that do not
resolve to a GitHub account at all (`"this-user-should-not-exist-zzq8812 is not a user"`).

Note that `torvalds` returned `"read"` rather than `"none"` because the repository is
public and every authenticated GitHub user has implicit `read` on a public repository.
On a public repository, `"none"` is correspondingly hard to reach.

For contrast, the sibling boolean-style endpoint is stricter and behaves as one might
hope: `GET /repos/{owner}/{repo}/collaborators/{username}` returned `204` for the
owner and `404` for both `torvalds` and `octocat`. That endpoint answers
"is this person a collaborator?" as a yes/no; the `/permission` endpoint answers
"what is this person's effective role?".

### Verdict for the app's role check

**The app must do its own comparison.** The check is *not* self-enforcing.

GitHub will happily answer the question "what can this stranger do to this repo?"
with `200` and `read`. There is no refusal, no 403, and no 404 in the collaborator
case. A check that merely tests "did the call succeed?" would classify every
GitHub user on earth as a Contributor. The comparison the app must perform is
against the `permission` / `role_name` / `user.permissions.push` fields, treating
anything below `write` (i.e. `read`, `triage`, `none`) as "not a Contributor".

---

## Q2. Does OAuth authorisation-code flow with PKCE work from a client-side SPA holding no client secret?

### PKCE is supported on both flows, and only `S256`

- **Documented.** For OAuth apps, `GET https://github.com/login/oauth/authorize`
  accepts `code_challenge` and `code_challenge_method`; "Must be `S256` — the `plain`
  code challenge method is not supported." `POST https://github.com/login/oauth/access_token`
  accepts `code_verifier`, "Required if `code_challenge` was sent during the user
  authorization."
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow>
- **Documented.** For GitHub Apps, the same two parameters are documented on the
  authorize step and `code_verifier` on the exchange step.
  <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token>
- **Documented.** Both are marked "Strongly recommended" rather than required.
  GitHub's changelog states: "GitHub is not requiring PKCE for any authentication
  flow at this time, as GitHub does not distinguish between public and confidential
  clients. Both GitHub Apps and OAuth apps should use PKCE with the authorization
  code flow. The device code flow and installation token flows do not use PKCE."
  <https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/>

### The client_secret question — the important caveat

- **Documented.** The OAuth app exchange table still lists `client_secret` as
  **Required**, and PKCE's presence does not mark it optional.
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow>
- **Documented.** The GitHub App user access token exchange likewise lists
  `client_secret` as **Required**.
  <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app>
- **Documented.** The two places where GitHub *does* relax this are both
  non-authorization-code paths. Device flow: "The `client_secret` is not needed for
  the device flow." Token refresh: `client_secret` is "Required unless the token was
  generated using the device flow."
- **Documented.** Every first-party tutorial for the web application flow uses a
  server-side `.env` holding a client secret.
  <https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app>

**Unverified:** whether GitHub's token endpoint actually *rejects* a request that
omits `client_secret` when a valid `code_verifier` is supplied. The documentation
table says "Required" while the changelog says GitHub "does not distinguish between
public and confidential clients", which reads as an invitation to omit it. The
documentation is not self-consistent here, and I did not find a primary statement
resolving it. **This needs a live test before the architecture relies on it.**

### CORS — the constraint that is documented and confirmed

- **Documented.** The OAuth authorize documentation still carries the notice
  "CORS pre-flight requests (OPTIONS) are not supported at this time."
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow>
- **Observed.** A CORS preflight (`OPTIONS` with `Origin` and
  `Access-Control-Request-Method`) against `https://github.com/login/oauth/access_token`
  returned `404` with **no** `Access-Control-Allow-Origin` header, while the same
  probe against `https://api.github.com` returned `200` with
  `Access-Control-Allow-Origin: *`. The REST API is CORS-open; the OAuth token
  endpoint is not.

This is the load-bearing practical finding for a Pages-hosted SPA: the *data* calls
are browser-friendly, but the one call that converts an authorization code into a
token is cross-origin-restricted.

### Device flow as the client_id-only alternative

- **Documented.** Device flow exists for both OAuth apps and GitHub Apps, and is the
  one flow documented as not needing a client secret. "For the device flow, you must
  pass your app's client ID... The `client_secret` is not needed for the device flow."
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow>
- **Documented.** The same is documented for GitHub Apps.
  <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token>
- **Documented trade-off.** The user must open `https://github.com/login/device` and
  type an 8-character code (e.g. `WDJB-MJHT`). The code expires after 15 minutes
  (900 s), the client must poll at no more than once per `interval` (default 5 s), and
  exceeding it yields `slow_down`, which adds 5 s to the interval. Polling faster than
  the allowed interval hits a rate limit; a submitted user code is rate limited to 50
  submissions per hour per application.
- **Documented.** Device flow must be enabled in the app's settings first, and an app
  that has not enabled it returns `device_flow_disabled`.
- **Documented.** The device flow is described as intended for "headless apps, such as
  CLI tools" — a browser-based SPA is not its stated use case.

### Scopes: reading and writing a PUBLIC repository

- **Documented.** `public_repo` "Limits access to public repositories. That includes
  read/write access to code, commit statuses, repository projects, collaborators, and
  deployment statuses for public repositories."
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps>
- **Documented.** `(no scope)` "Grants read-only access to public information
  (including user profile info, repository info, and gists)" — so **no scope is needed
  to read** a public repository.
- **Documented.** The `PUT /repos/{owner}/{repo}/contents/{path}` endpoint states:
  "OAuth app tokens and personal access tokens (classic) need the `repo` scope to use
  this endpoint. The `workflow` scope is also required in order to modify files in the
  `.github/workflows` directory."
  <https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents>

**Answer: `public_repo` is sufficient for both reading and writing a public
repository.** The endpoint's prose mentions `repo`, but `public_repo` is defined as
covering read/write to code in public repositories, and the `repo` scope is the
superset needed only when private repositories are in play. The `workflow` scope is
additionally required only for files under `.github/workflows`.

- **Documented.** For a GitHub App, scopes do not exist at all; fine-grained
  permissions replace them, and a user access token has only the intersection of what
  the user and the app can do. `PUT /repos/{owner}/{repo}/contents/{path}` requires
  `Contents: write`. <https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps>

---

## Q3. Conflict semantics of `PUT /repos/{owner}/{repo}/contents/{path}`

### Status and body when the supplied `sha` does not match

- **Documented.** Documented status codes are `200`, `201`, `404`, `409` (Conflict),
  `422` (Validation failed, or the endpoint has been spammed).
  <https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents>
- **Observed.** Supplying a stale/incorrect `sha` yields **HTTP `409`**, with body:

```json
{
  "message": "probe-scratch.txt does not match 0000000000000000000000000000000000000000",
  "documentation_url": "https://docs.github.com/rest/repos/contents#create-or-update-file-contents",
  "status": "409"
}
```

So the losing writer is told precisely *which* file and *which* sha it lost to, and
no commit is created.

### Is there an atomic "create only if it does not exist" primitive?

**Yes — and it is the same `PUT`, by omitting `sha`.**

- **Documented.** `sha` is "Required if you are updating a file. The blob SHA of the
  file being replaced." It is optional in the schema, which is what makes create and
  update share one endpoint.
- **Observed.** Omitting `sha` on a path that **already exists** fails safely with
  **HTTP `422`**, body:

```json
{
  "message": "Invalid request.\n\n\"sha\" wasn't supplied.",
  "documentation_url": "https://docs.github.com/rest/repos/contents#create-or-update-file-contents",
  "status": "422"
}
```

That is the create-only-if-absent guard, and it is genuinely atomic: two clients that
both believe the file is absent both omit `sha`, and exactly one wins.

- **Observed.** Concurrent creates of the same new path, fired in parallel, both
  without `sha`: **`201` and `409`**. One create succeeded; the other was refused.

- **Documented, related.** A comparable atomic create-only-if-absent primitive exists
  for refs: `POST /repos/{owner}/{repo}/git/refs` returns `409` on conflict.
  <https://docs.github.com/en/rest/git/refs#create-a-reference>
- **Observed.** `POST /repos/{owner}/{repo}/git/refs` against an already-existing ref
  returned **`422`** with `{"message":"Reference already exists"}`, not `409`.

**Consequence:** the "create if absent" property is available at file granularity via
omitting `sha`, and at branch granularity via `POST /git/refs`. Both are refusal-based
rather than compare-and-swap, which is the weaker but simpler guarantee — a client
cannot tell "you lost a race" from "the object changed under you" without reading the
current state.

### Concurrency of two simultaneous PUTs to the same path

- **Observed.** Two PUTs to the same path, both carrying the **same correct** `sha`,
  fired in parallel: **`409` and `200`**. One writer won, the other was refused with
  the same `"does not match <sha>"` body.

**Answer: the second writer does not silently overwrite.** The `sha` acts as an
optimistic-concurrency token, and the loser gets a `409`. Silent overwrite is only
possible in one specific case, which the API blocks: writing *without* a `sha` to a
path that already exists is a `422`, not a blind overwrite.

- **Documented.** The endpoint documentation carries a related serialisation note:
  "If you use this endpoint and the 'Delete a file' endpoint in parallel, the
  concurrent requests will conflict and you will receive errors. You must use these
  endpoints serially instead."

---

## Q4. `GITHUB_TOKEN` inside a GitHub Actions workflow

### What it is and how long it lives

- **Documented.** "At the start of each workflow job, GitHub automatically creates a
  unique `GITHUB_TOKEN` secret." It is a **GitHub App installation access token**, and
  "The token's permissions are limited to the repository that contains your workflow."
  <https://docs.github.com/en/actions/concepts/security/github_token>
- **Documented, lifetime.** "Before each job begins, GitHub fetches an installation
  access token for the job. The `GITHUB_TOKEN` expires when the job finishes or after
  its effective maximum lifetime." Maximum lifetime is **6 hours** on GitHub-hosted
  runners, and **24 hours** on self-hosted runners (the job itself may run 5 days, but
  the token "can only be refreshed for up to 24 hours"). So within a single job the
  token is effectively long-lived and never rotates mid-job.

### Default permissions vs an explicit `permissions:` block

- **Documented.** Defaults are **not fixed by GitHub**; they are inherited:
  "The permissions for the `GITHUB_TOKEN` are initially set to the default setting for
  the enterprise, organization, or repository." They are then narrowed by any
  `permissions:` in the workflow file, "first at the workflow level and then at the job
  level."
  <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions>
- **Documented.** Organisation owners can further restrict write access at the
  repository level.
- **Documented.** Under-trigger narrowing: "if the workflow was triggered by a pull
  request event other than `pull_request_target` from a forked repository, and the
  **Send write tokens to workflows from pull requests** setting is not selected, the
  permissions are adjusted to change any write permissions to read only."
- **Documented.** `pull_request_target` is the exception: the token is granted
  read/write repository permission "even when it is triggered from a public fork".
- **Documented.** Any explicitly specified permission is `read`, `write`, or `none`,
  and "If you specify the access for any of these permissions, all of those that are
  not specified are set to `none`." So an explicit block is deny-by-default, and
  `read-all` / `write-all` are the shorthand forms.

**Because the default is environment-dependent, the app cannot rely on `GITHUB_TOKEN`
having any particular capability unless the workflow declares `permissions:` itself.**

### Can it push to a branch?

- **Documented.** `contents` permission controls this: "`contents: read` permits an
  action to list the commits, and `contents: write` allows the action to create a
  release." With `contents: write` the token can create commits and push to branches
  via the Git data API.
- **Documented, important caveat.** "If a workflow run pushes code using the
  repository's `GITHUB_TOKEN`, a new workflow will not run even when the repository
  contains a workflow configured to run when `push` events occur." And: "Commits pushed
  by a GitHub Actions workflow that uses the `GITHUB_TOKEN` do not trigger a GitHub
  Pages build."
- **Documented.** To get workflow runs to execute on such pushes, the docs direct you
  to use a GitHub App installation access token or a PAT instead.

**That Pages caveat is directly load-bearing for this system**, which is deployed as a
static SPA on GitHub Pages: a `GITHUB_TOKEN`-driven push to the deployed branch will
not by itself rebuild the site.

### Can it create issues and write issue comments?

- **Documented.** Yes, under the `issues` permission: `issues: write` permits
  creating an issue. The reference example is precisely this —
  `gh issue --repo ${{ github.repository }} create` with
  `permissions: {contents: read, issues: write}`.
  <https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication>
- **Documented.** Comment writes are under the same `issues` permission
  (`POST /repos/{owner}/{repo}/issues/{issue_number}/comments` requires `issues: write`).
  <https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps>
- **Documented.** The token is also available as the `github.token` context, and
  "An action can access the `GITHUB_TOKEN` through the `github.token` context even if
  the workflow does not explicitly pass the `GITHUB_TOKEN` to the action" — a
  reminder that narrowing `permissions:` is the only real control.

---

## Q5. Token lifetime

### OAuth App access tokens

- **Documented.** They **do not expire by default**, and they **can be configured to
  expire.** "To enforce regular token rotation and reduce the impact of a compromised
  token, you can configure your OAuth app to get access tokens that expire. When your
  app uses access tokens that expire, you will also receive a refresh token with your
  access token. Both the web application flow and the device flow support expiring
  tokens."
  <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#expiring-access-tokens>
- **Documented.** Expiry values: "The access token expires after eight hours, and the
  refresh token expires after six months without use." In the response these appear as
  `expires_in=28800` and `refresh_token_expires_in=15897600`.
- **Documented, opt-in without reconfiguring.** Adding the `offline_access` scope
  yields an expiring token and a refresh token "even if your app is not configured to
  use expiring tokens."
- **Documented, migration hazard.** "Enabling this feature does not cause existing
  tokens to expire—they will continue to be long-lived. If you want to switch to
  expiring tokens, have the user sign in again."
- **Documented.** Even a non-expiring token is not immortal: "GitHub will
  automatically revoke an OAuth token or personal access token when the token hasn't
  been used in one year."
  <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation>
- **Documented.** A long-lived OAuth token sitting in a browser's `localStorage` is
  additionally exposed to a specific automated revocation: "If a valid OAuth token,
  GitHub App token, or personal access token is pushed to a public repository or public
  gist, the token will be automatically revoked." For a project whose entire history
  lives in a public repository, that is a live hazard rather than a hypothetical.

### GitHub App user access tokens

- **Documented, default.** "By default, the user access token expires after 8 hours."
  Expiration is enabled by default when a GitHub App is created, and "Owners of GitHub
  Apps can optionally configure these tokens to never expire instead, but this is not
  recommended due to the security implications."
  <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app>
- **Documented, with refresh.** With expiration enabled, a refresh token is also issued
  and "expires after six months". A refresh token is single-use: "Once you use a
  refresh token, that refresh token and the old user access token will no longer work."
  <https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens>
- **Documented.** The values are fixed constants, not configurable: `expires_in` "will
  always be `28800` (8 hours)" and `refresh_token_expires_in` "will always be
  `15897600` (6 months)".
- **Documented.** Refresh requires a client secret unless the token came from device
  flow — the same constraint as the initial exchange.
- **Documented.** The maximum practical lifetime of a continuously-refreshed
  GitHub App user token is therefore **8 hours per token, 6 months per refresh token**,
  after which the user must re-authorise. GitHub Apps are markedly better than OAuth
  Apps here: 8 hours by default versus non-expiring by default.
- **Documented.** Revocation is observable: if a user revokes authorisation the app
  receives the `github_app_authorization` webhook, and continued use yields
  `401 Bad Credentials`.

### The localStorage problem, in the docs' own terms

- **Documented.** GitHub's guidance is unambiguous: "You should keep user access
  tokens and refresh tokens secure... If you choose to store the user access token or
  refresh token, you must store it securely. You should never publicize the token."
- **Unverified.** There is no first-party GitHub documentation that prescribes a
  specific browser storage mechanism for tokens, nor one that blesses or forbids
  `localStorage` by name. The security claim here follows from the general
  "never publicize the token" guidance plus the automatic-revocation rule above, not
  from a document that discusses `localStorage`.

---

## Implications for this system

Observations only. The design decisions belong to the human.

### What the app can trust about the collaborator check

1. **GitHub does not enforce the role check; the app must.** Q1 is the single most
   consequential finding, and it is the opposite of what the architectural bet
   anticipated. A stranger is not refused: `torvalds` received `200` with
   `permission: "read"`. Any check phrased as "did GitHub let me ask?" is broken by
   construction.
2. **The comparison is a field comparison, not a status-code comparison.** The
   meaningful signal is `permission` / `role_name` / `user.permissions.push`. `read`
   and `none` and `triage` are all "not a Contributor"; `write`, `maintain` and
   `admin` are. Note `maintain` maps to `write` and `triage` maps to `read` in the
   `permission` field, so `permission` alone loses the distinction between `maintain`
   and `write`; `role_name` preserves it.
3. **The repo being public makes `"none"` a near-unreachable value.** Every
   authenticated GitHub user has implicit `read` on a public repository, so a
   "deny unless `none`" framing is not the same as it would be on a private repo.
4. **There is a cheaper, stricter endpoint available.** The sibling
   `GET /repos/{owner}/{repo}/collaborators/{username}` returned `204`/`404` and
   answers collaborator-membership as a genuine yes/no, with no `read`-shaped
   ambiguity. It is documented as requiring push access for the caller, which
   Q1's `/permission` endpoint is not. Which of the two to use is a design choice.
5. **Whatever the app concludes, git remains the real backstop.** The "may this user
   write" property is still enforced by git, exactly as intended. What Q1 removes is
   the *convenience* of a self-enforcing role check, not the underlying enforcement:
   a misclassified user who tries to write will still be refused by the repository.
   The bet is weaker but not broken — the failure mode becomes "a stranger sees a
   Contributor UI they cannot use" rather than "a stranger commits to the ledger."
6. **Distributor is unaffected by all of this.** It is a configured office, not a
   repository permission, so no GitHub endpoint can answer it. It remains the one role
   the system must read from Config.

### What the lifetime cap's enforcement has to rest on, given Q3

The context file states the invariant plainly: *a Person may hold at most one Award
in their lifetime*. With no server, the app cannot serialise writes through a
lock, so the invariant has to be made of GitHub's own primitives. Q3 supplies two:

7. **The create-without-`sha` guard is an atomic test-and-set.** Two clients that both
   believe no Award exists for a Person both omit `sha`; exactly one gets `201` and
   the other gets `409`. Observed directly. This is the strongest enforcement
   primitive available, and it is stronger than a read-then-write check, which has a
   window between the two calls.
8. **The `sha` argument makes updates fail loudly rather than silently clobbering.**
   Two writers on the same path, both holding the correct `sha`, produced `200` and
   `409` — never a silent overwrite. A lost race is therefore always visible to the
   loser as a `409`, and the response names the file and the sha that beat it.
9. **So the invariant can rest on a single filesystem-shaped fact** — the presence of
   a per-Person file — rather than on any in-browser bookkeeping. Any client, including
   a hostile one, that tries to issue a second Award runs into the same `409` wall.
   The invariant is enforced by the repository's own write semantics, not by the app.
10. **The corollary is that the cap's integrity depends on the data layout, not on the
    UI.** If the cap is represented as "a file per Person exists", it is enforced. If
    it is ever represented as a counter, a list, or a scan-and-count, it is not —
    the same read-then-write gap reappears. Q3 is therefore a constraint on how the
    Ledger must be *shaped*.
11. **A 409 is a normal outcome, not an exceptional one.** Any flow built on these
    primitives must treat `409` on Award issuance as a first-class expected result
    rather than an error path. `422 "sha wasn't supplied"` likewise signals a
    create-attempt against a path that already exists — the same fact, reported
    differently.
12. **Token lifetime bounds the session, not the invariant.** Q5's numbers (8 hours
    per user token, 6 months per refresh token) bound how long a browser can hold
    write authority. They do not weaken rule 9, because the enforcement is in the
    repository rather than in the session. The 6-month refresh horizon does, however,
    make "a long-lived token in `localStorage`" a real exposure given that pushing a
    token to a public repo auto-revokes it — and this system's history is public.
13. **`GITHUB_TOKEN` cannot be the enforcement backstop either.** Q4 shows the token
    does not persist across jobs and, critically, that commits it pushes do not
    trigger a GitHub Pages build — the deployment substrate for this app.

### Open questions this research could not settle

- Whether the token exchange endpoint actually accepts a request that omits
  `client_secret` when a valid `code_verifier` is present. The docs say required; the
  changelog implies otherwise. Needs a live test (Q2).
- Whether the device flow is acceptable UX for a browser-based audience. It is
  documented for headless clients, not browsers (Q2).
- `localStorage` versus other storage for the token: no first-party GitHub guidance
  addresses browser storage directly (Q5).
