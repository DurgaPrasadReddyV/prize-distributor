# Prize Distributor — Context

A glossary, and nothing else. Terms are canonical here; if conversation elsewhere
disagrees with this file, this file wins and the disagreement is a bug.

## Organisation

The single company this system serves. Every Person in the system belongs to it.
The system has no notion of multiple organisations and is not built for one.

## Person

A human being, identified by their GitHub login. Every Person in the system is a
member of the Organisation — there are no external winners.

A Person is the subject of every record the system keeps, and the key the
one-prize rule is enforced on. GitHub login is the identifier, not a display
detail: it is what the repository recognises.

## Contributor

A Person the repository grants write access to. A Contributor may record an Entry
claiming that some Person — possibly themselves — won an Event.

"Contributor" is a repository permission, not an application role. It means
exactly "git will accept this Person's commits", and nothing more.

## Distributor

A Person who verifies an Entry and issues the Award that follows from it. A
Distributor is also a Contributor, because issuing an Award writes to the
repository.

The Distributor is a designated office, not a repository permission. Being able
to write does not make someone the Distributor. This is the system's one role
that lives outside git, and it is therefore the one role that git cannot enforce.

## Event

Something a Person can win, from a fixed configured list. An Event is named and
may recur. An Event is not a container of Prizes; what a Person wins by winning
it is decided at Award time, not at Entry time.

## Entry

A **claim** that a Person won an Event. An Entry is an assertion, not a fact: it
can be wrong, and it exists in order to be checked.

An Entry is created by a Contributor and is meaningless on its own — it carries no
prize and touches no inventory. It becomes meaningful only when a Distributor
verifies it and issues an Award against it.

An Entry and an Award are different objects. Conflating them is the single most
common way to misread this system: recording an Entry does not give anyone a
prize, and an Award always rests on an Entry that was checked first.

An Entry is *pending* until it reaches exactly one terminal state, and there are
four ways to end: **awarded**, **rejected**, **superseded**, or **withdrawn**. Once
it has left pending it is frozen, which is what bounds a Contributor's ability to
change their own claim.

## Superseded

The state of an Entry that may well be true but can no longer be acted on, because
the Person it names won something else first. **Never stored** — it is what an
Entry *is* once its Person holds an Award arising from a different Entry.

Superseded is emphatically **not** rejected. Rejection means the claim was judged
false; supersession means the claim lost. Recording one as the other would put a
"did not win" stamp on a true statement, in a public record that cannot be edited
later — which is why the two states are kept apart at the level of meaning and not
merely at the level of wording.

## Withdrawal

The taking back of a `pending` Entry by the Contributor who created it, before
anyone has judged it. Only a Contributor may withdraw their own Entry, and only
while it is pending; withdrawal is unavailable the moment the Entry reaches any
other state.

## Award

A prize issued to a Person, drawn from inventory, after an Entry was verified.

An Award is the only object in the system that moves inventory and the only one a
Person can hold. **A Person may hold at most one Award in their lifetime**, across
every Event. This is a lifetime cap, not a per-Event cap, and it is the system's
central invariant.

Verifying a claim and issuing the prize against it are **one act**, not two. They
are inseparable because a lifetime cap has no second chance to offer: a claim
verified but not issued would be a Person who has spent their only prize and
received nothing. There is consequently no state in which a claim is believed but
unrewarded.

An Award is the system's one indivisible fact. It names the Person, the Prize, the
Event, the Entry that justified it, and the Distributor who issued it — and from
that single record every other consequence follows. Issuing one is a single act of
creation, and it never needs to be reconciled against anything else.

## Awarded

The state of an Entry that an Award was issued against. **Never stored** — it is
what an Entry *is* once an Award naming it exists.

## Prize

An item in the configured catalogue that can be issued as an Award.

## Inventory

What remains of each Prize, counted from the Awards already issued. **Never stored
as a balance** — there is no running figure to decrement and therefore none that
can drift from what was actually given.

What Config states per Prize is the *original allocation*, not a current balance.
Changing it later means adding to the record of what was given, never editing a
number that was counting something else.

## Ledger

The complete, permanent record of every Entry and every Award. It is the
authority on who has won what, and it cannot be silently rewritten: the history of
changes to it is itself part of the record.

A Ledger that cannot be silently rewritten is also a Ledger whose *shape* carries
meaning. Whether the one-Award rule holds is a property of how the Ledger is laid
out, not of any check the application performs while writing: a rule expressed as
a count or a scan can be raced, and a rule expressed as the presence of a record
cannot.

The Ledger is **append-only in practice**. What it gains, it gains; what it
records about the past, it does not edit. And it separates the two kinds of truth
that are often wrongly filed together:

- **The fact** — an Award happened. Stored, once, and immutable.
- **The consequence** — this Entry is therefore awarded; that one is therefore
  superseded; this Prize has therefore four left. Computed from the facts, never
  written down.

A consequence that gets stored is a consequence that can eventually contradict the
fact it came from. Deriving instead means that contradiction is not merely
unlikely, but unrepresentable.

Because consequence is derived, the Ledger can only be read as a whole. Knowing
whether one Entry was awarded means knowing every Award that has ever been issued
— which is why the Ledger's shape is two separate sets rather than one file, and
why the two are never allowed to collide with one another.

## Write Authority

The proof a Person supplies that the repository will accept their commits. It is
not held by the application on anyone's behalf — the Person brings it, it is used
only against the repository, and it is never written anywhere the Ledger can reach.

Write Authority is what separates a Contributor from a bystander. It is distinct
from office: holding it says nothing about whether someone is the Distributor.

Write Authority is a *borrowed* credential, and a narrow one. It grants less than
the Person actually has — a single repository, a single permission, a limited
life — because it is pasted into a web page, which is the last place a durable
secret belongs. A Person who loses Write Authority loses nothing they could not
mint again.

The consequence worth remembering: Write Authority is a *Person's* property, and it
identifies whoever holds it. If two People ever share one, the Ledger will
faithfully record the wrong name.

## Config

The configured facts the system operates on: which Events exist, which Prizes are
in the catalogue, how many of each were originally allocated, and who holds the
office of Distributor.

Config is stated, not discovered. It is the only place a Person's authority comes
from that is not derived from repository permissions.

Config is *hand-written and read live*. It is edited by a person in a diff, and it
takes effect the moment it is edited — never waiting on a build. That immediacy is
what makes the office it names worth protecting, and also what makes it dangerous:
the same property that lets a new Distributor take office without a redeploy is the
one that lets a Contributor promote themselves.

## Duplicate Entry

Two Entries naming the same Person for the same Event. This is **not an error** and
the two are kept separately.

Independent Contributors arriving at the same conclusion is the ordinary case that
verification exists to resolve, not a fault in either record. Collapsing them would
destroy a real claim and report to a Contributor that something had already been
recorded when it had not.
