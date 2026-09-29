/**
 * The Ledger's rules, with no knowledge of GitHub, the network, or the DOM.
 *
 * This is the module validated by the prototype and lifted nearly unchanged.
 * Everything the system believes about who has won is derived here from the
 * stored Awards — nothing is read from a stored state that could contradict
 * them.
 *
 * The load-bearing function is `resolveRefusal`. Already Won arrives as 409 for
 * a genuine race and 422 for a late or retried create, so it is established by
 * LOOKING at the file, never by trusting a status code.
 */

export type EntryState =
  | 'pending'
  | 'awarded'
  | 'rejected'
  | 'superseded'
  | 'withdrawn';

export type StoredJudgement = 'rejected' | 'withdrawn' | null;

export interface Award {
  personId: string;
  prizeId: string;
  eventId: string;
  entryId: string;
  issuedBy: string;
  issuedAt: string;
}

export interface Entry {
  id: string;
  personId: string;
  eventId: string;
  recordedBy: string;
  recordedAt: string;
  /** Only rejected/withdrawn are ever stored; the rest are derived. */
  stored?: StoredJudgement;
}

export interface Ledger {
  /** Keyed by Person: at most one Award can exist per Person, structurally. */
  awards: Record<string, Award>;
  entries: Record<string, Entry>;
}

export interface Prize {
  id: string;
  name: string;
  allocation: number;
}

export interface PrizeCatalogue {
  [prizeId: string]: Prize;
}

export const emptyLedger = (): Ledger => ({ awards: {}, entries: {} });

/**
 * The state of a claim, worked out from the Awards and any stored judgement.
 * `awarded` and `superseded` are never stored, because nothing else implies
 * them and a stored consequence can eventually contradict its cause.
 */
export function entryState(ledger: Ledger, entry: Entry): EntryState {
  if (Object.values(ledger.awards).some((a) => a.entryId === entry.id)) {
    return 'awarded';
  }
  if (entry.stored === 'rejected') return 'rejected';
  if (entry.stored === 'withdrawn') return 'withdrawn';
  const theirAward = Object.values(ledger.awards).find(
    (a) => a.personId === entry.personId,
  );
  if (theirAward) return 'superseded';
  return 'pending';
}

/**
 * Whether a Person already holds an Award. This is a *capability check* for the
 * UI and is deliberately NOT the enforcement — enforcement is the atomic write
 * in `issueAward`. It cannot be made race-free, which is why the app warns
 * rather than blocks, and why the Award file is what actually decides.
 */
export function personHasWon(ledger: Ledger, personId: string): boolean {
  return Object.values(ledger.awards).some((a) => a.personId === personId);
}

/** Stock remaining, counted from Awards issued. Never a stored balance. */
export function remaining(
  ledger: Ledger,
  catalogue: PrizeCatalogue,
  prizeId: string,
): number {
  const prize = catalogue[prizeId];
  if (!prize) return 0;
  const given = Object.values(ledger.awards).filter(
    (a) => a.prizeId === prizeId,
  ).length;
  return prize.allocation - given;
}

export type RefusalOutcome =
  | 'already-won'
  | 'retryable'
  | 'blocked'
  | 'unknown';

export interface Refusal {
  outcome: RefusalOutcome;
  /** True only when re-issuing the same write is safe. Never for already-won. */
  retry: boolean;
  /** How strong the guarantee is, for the wording shown to a Person. */
  strength: 'enforced' | 'advisory';
}

/**
 * Resolve a refused write by LOOKING, not by trusting the status code.
 *
 * `409` means a genuine race lost; `422` means the create arrived just after the
 * winner committed (a double-click, or a retry after a timeout) — and that is
 * the more common of the two. Both mean the same thing to a Person, and both are
 * settled by whether the Award file is there when we go and check.
 *
 * Retrying an already-won write is the one thing that must never happen.
 */
export function resolveRefusal(
  status: number,
  awardFileExists: boolean,
): Refusal {
  if (awardFileExists) {
    return { outcome: 'already-won', retry: false, strength: 'enforced' };
  }
  if (status === 403 || status === 404) {
    return { outcome: 'blocked', retry: false, strength: 'advisory' };
  }
  if (status === 409 || status === 422) {
    return { outcome: 'retryable', retry: true, strength: 'advisory' };
  }
  return { outcome: 'unknown', retry: false, strength: 'advisory' };
}

/** The Person a given Person's Award came from, if any. Used for supersession. */
export function awardFor(
  ledger: Ledger,
  personId: string,
): Award | undefined {
  return Object.values(ledger.awards).find((a) => a.personId === personId);
}

export interface LedgerCounts {
  awards: number;
  winners: number;
  pending: number;
}

/** Totals for the record count the app shows, so growth is visible early. */
export function counts(ledger: Ledger): LedgerCounts {
  const entries = Object.values(ledger.entries);
  return {
    awards: Object.keys(ledger.awards).length,
    winners: new Set(Object.values(ledger.awards).map((a) => a.personId)).size,
    pending: entries.filter((e) => entryState(ledger, e) === 'pending').length,
  };
}
