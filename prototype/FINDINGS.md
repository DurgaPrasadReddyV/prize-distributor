# Prototype findings — the write path, executed

Answers [issue #8](https://github.com/DurgaPrasadReddyV/prize-distributor/issues/8).
Branch: `prototype/concurrent-write-path` (throwaway — **not** merged to `main`).

## What was actually run

Not a simulation. Every claim below came from calling the live GitHub API against
this repository with real concurrent requests. The demo at `prototype/index.html`
then exercises the *decision logic* built on top of those observed facts.

| File | What it is |
|---|---|
| `prototype/index.html` | Shareable demo. One file, double-click, no install. Drives the model; the pure logic block lifts into production. |
| `prototype/probe.mjs` | Live probe. Five scenarios against the real API, provoking failures deliberately. |
| `prototype/probe2.mjs` | Narrowing probe. Establishes the exact refusal semantics. |
| `prototype/verify-logic.mjs` | Extracts the logic out of the HTML by regex so it cannot drift, then checks it. **23 passed, 0 failed.** |

Scratch paths were written under `data/prototype-scratch/` and removed afterwards.
One file survived the first cleanup pass and was caught and removed in a follow-up
commit — worth recording, because the Ledger is public and permanent, and a real
one will eventually hold real people's real prizes.

## The verdict

**The core claim survives. The one-Award cap is enforced by the repository, exactly
as designed, and a determined client cannot route around it.**

| Scenario | Result |
|---|---|
| Two Distributors award the same Person, simultaneously | **201 and 409** — one Award created, one refused |
| Same Distributor clicks award twice | **201 then 422** — no second Award |
| Two Contributors edit the same pending Entry | **200 and 409** — the loser's change is refused, not merged |
| Read a path that does not exist | **404** |

Not one case produced a silent overwrite. The `sha` is a genuine
optimistic-concurrency token, and creating a file that already exists is refused
rather than merged. That is the guarantee the whole design rests on, and it is
observed rather than inferred.

## The finding that changes a decision

**Already Won arrives as either 409 or 422, and the map only accounted for 409.**

The distinction is timing, and it is invisible from the caller's side:

- **Genuine race** — two writes arrive together, the loser gets **409**, with a
  message about a sha mismatch. This is the `409` the design anticipated.
- **Late or retried create** — the write arrives *after* the winner has already
  committed. No `sha` was supplied, and the path now exists, so GitHub rejects it
  as a malformed request: **422, `"sha" wasn't supplied.`**

A double-click, or a request retried after a network timeout, takes the **422**
path. That is not an edge case — it is the *common* case for the scenario the
design most cared about. Treating `409` as the only signal for Already Won would
have left the most frequent path misreported as a generic failure, inviting a
retry that must never happen.

**The resolution strategy in ticket #6 was right, and this is why.** The decision
was to resolve *any* refusal by reading the file rather than by trusting the
status code. Had the implementation keyed on `409` alone, this would have been a
live bug. Reading the file answers correctly for both:

```js
if (status === 409 || status === 422) {
  const exists = await fileExists(awardPath);
  return exists ? AlreadyWon : Retryable;   // never retry AlreadyWon
}
```

`403` and `404` are a third case — no write access, or the repository is gone —
and are reported as blocked rather than retried.

## The second finding: reads are the real cost

Deriving every state from the Award set means the client must fetch **all** Awards
before it can correctly label a single Entry. That was accepted on paper at
"hundreds of records". The probes make the shape concrete: each Award is a separate
`GET` after a directory listing, all client-side, with no server to aggregate.

It works. It is also the constraint most likely to be felt first, and it arrives as
an unexplained slow page rather than an error. The documented ceiling and the
on-screen record count are not nice-to-haves; they are the only warning this design
will ever give.

## What is worth keeping

The pure logic block in `index.html` lifts directly into the real module:

- `entryState(ledger, entry)` — derives `awarded` / `superseded` / `pending` from
  Awards and stored judgements alone. Never reads a stored state for `awarded` or
  `superseded`.
- `personHasWon(ledger, personId)` — the capability check, kept deliberately
  separate from the atomic write that enforces it.
- `remaining(ledger, prizeId)` — stock counted from Awards, never a stored balance.
- `resolveRefusal(status, fileExists)` — the load-bearing one. Resolves by looking,
  not by trusting the status code.

The HTML shell is a demo harness and should not ship.

## What this does not prove

- **Nothing about the UI.** No screen was built, so the wording of Already Won, of
  exhausted stock, and of the self-issuance refusal is still unexercised. Those are
  the messages a Distributor actually reads, and the one-per-prize asymmetry
  between them only matters if they are written distinctly.
- **Nothing about scale.** Probes used a handful of records. The "hundreds, not
  thousands" ceiling remains an estimate.
- **Nothing about the read path as a user experiences it.** The cost is real and
  measured; the moment it becomes intolerable is not.
- **Nothing about a hostile client.** The probes used honest callers. The claim
  that a malicious client cannot obtain two Awards rests on the file's existence,
  which is structural — but it was not attacked directly.

## Recommended next step

Build the real app against this, treating the derived-state read path as the thing
most likely to need revisiting, and the Already Won wording as the thing most
likely to need care.
