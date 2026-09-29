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

## Award

A prize issued to a Person, drawn from inventory, after an Entry was verified.

An Award is the only object in the system that moves inventory and the only one a
Person can hold. **A Person may hold at most one Award in their lifetime**, across
every Event. This is a lifetime cap, not a per-Event cap, and it is the system's
central invariant.

## Prize

An item in the configured catalogue that can be issued as an Award.

## Inventory

The count of each Prize remaining to be issued. Issuing an Award decrements it.

## Ledger

The complete, permanent record of every Entry and every Award. It is the
authority on who has won what, and it cannot be silently rewritten: the history of
changes to it is itself part of the record.

A Ledger that cannot be silently rewritten is also a Ledger whose *shape* carries
meaning. Whether the one-Award rule holds is a property of how the Ledger is laid
out, not of any check the application performs while writing: a rule expressed as
a count or a scan can be raced, and a rule expressed as the presence of a record
cannot.

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
in the catalogue, how much inventory each holds, and who holds the office of
Distributor.

Config is stated, not discovered. It is the only place a Person's authority comes
from that is not derived from repository permissions.
