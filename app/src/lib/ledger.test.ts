import { describe, it, expect } from 'vitest';
import {
  emptyLedger,
  entryState,
  personHasWon,
  remaining,
  resolveRefusal,
  counts,
  type Award,
  type Entry,
  type Ledger,
  type PrizeCatalogue,
} from './ledger';

const catalogue: PrizeCatalogue = {
  keyboard: { id: 'keyboard', name: 'Keyboard', allocation: 2 },
};

const entry = (id: string, personId: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  personId,
  eventId: 'hackathon-2026',
  recordedBy: 'contributor',
  recordedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const award = (personId: string, entryId: string, prizeId = 'keyboard'): Award => ({
  personId,
  entryId,
  prizeId,
  eventId: 'hackathon-2026',
  issuedBy: 'distributor',
  issuedAt: '2026-01-02T00:00:00Z',
});

const ledgerWith = (awards: Award[], entries: Entry[] = []): Ledger => ({
  awards: Object.fromEntries(awards.map((a) => [a.personId, a])),
  entries: Object.fromEntries(entries.map((e) => [e.id, e])),
});

describe('entryState — derived, never stored', () => {
  it('a fresh claim is pending', () => {
    const l = ledgerWith([], [entry('e1', 'alex')]);
    expect(entryState(l, l.entries.e1)).toBe('pending');
  });

  it('an Award makes its own claim awarded', () => {
    const l = ledgerWith([award('alex', 'e1')], [entry('e1', 'alex')]);
    expect(entryState(l, l.entries.e1)).toBe('awarded');
  });

  it("a second claim by a winner is SUPERSEDED, not rejected", () => {
    const l = ledgerWith(
      [award('alex', 'e1')],
      [entry('e1', 'alex'), entry('e2', 'alex')],
    );
    expect(entryState(l, l.entries.e1)).toBe('awarded');
    expect(entryState(l, l.entries.e2)).toBe('superseded');
  });

  it('a rejected claim stays rejected even after that person later wins', () => {
    const l = ledgerWith(
      [award('alex', 'e3')],
      [entry('e1', 'alex', { stored: 'rejected' }), entry('e3', 'alex')],
    );
    expect(entryState(l, l.entries.e1)).toBe('rejected');
    expect(entryState(l, l.entries.e3)).toBe('awarded');
  });

  it('a withdrawn claim stays withdrawn', () => {
    const l = ledgerWith([], [entry('e1', 'alex', { stored: 'withdrawn' })]);
    expect(entryState(l, l.entries.e1)).toBe('withdrawn');
  });

  it('a stored judgement never overrides the Award that exists', () => {
    // Defensive: the Award file is the fact. A stray `stored` field must not
    // be able to make a won claim read as rejected.
    const l = ledgerWith(
      [award('alex', 'e1')],
      [entry('e1', 'alex', { stored: 'rejected' })],
    );
    expect(entryState(l, l.entries.e1)).toBe('awarded');
  });
});

describe('the one-Award-per-Person cap', () => {
  it('a Person who has won is reported as having won', () => {
    const l = ledgerWith([award('alex', 'e1')]);
    expect(personHasWon(l, 'alex')).toBe(true);
    expect(personHasWon(l, 'sam')).toBe(false);
  });

  it('is structural: Awards keyed by Person cannot hold two', () => {
    const l = ledgerWith([award('alex', 'e1')]);
    // Whatever a client attempts, the shape admits one entry per Person.
    l.awards.alex = award('alex', 'e9');
    expect(Object.keys(l.awards)).toEqual(['alex']);
    expect(l.awards.alex.entryId).toBe('e9');
  });

  it('allows two People, two Awards — the cap is per Person, not total', () => {
    const l = ledgerWith([award('alex', 'e1'), award('sam', 'e2')]);
    expect(personHasWon(l, 'alex')).toBe(true);
    expect(personHasWon(l, 'sam')).toBe(true);
  });
});

describe('inventory — counted, never decremented', () => {
  it('starts at the allocation', () => {
    expect(remaining(emptyLedger(), catalogue, 'keyboard')).toBe(2);
  });

  it('falls as Awards are issued', () => {
    const l = ledgerWith([award('alex', 'e1')]);
    expect(remaining(l, catalogue, 'keyboard')).toBe(1);
  });

  it('goes negative when over-issued, so the app can refuse', () => {
    const l = ledgerWith([award('alex', 'e1'), award('sam', 'e2'), award('robin', 'e3')]);
    expect(remaining(l, catalogue, 'keyboard')).toBe(-1);
  });

  it('a superseded claim does not consume stock', () => {
    const l = ledgerWith(
      [award('alex', 'e1')],
      [entry('e1', 'alex'), entry('e2', 'alex')],
    );
    expect(remaining(l, catalogue, 'keyboard')).toBe(1);
  });
});

describe('resolveRefusal — established by looking, not by status code', () => {
  it('409 with the file present means Already Won, and is never retried', () => {
    const r = resolveRefusal(409, true);
    expect(r.outcome).toBe('already-won');
    expect(r.retry).toBe(false);
  });

  it('422 with the file present ALSO means Already Won (late create)', () => {
    // This is the common case: a double-click, or a retry after a timeout.
    const r = resolveRefusal(422, true);
    expect(r.outcome).toBe('already-won');
    expect(r.retry).toBe(false);
  });

  it('marks Already Won as enforced, so wording can differ from an error', () => {
    expect(resolveRefusal(409, true).strength).toBe('enforced');
    expect(resolveRefusal(409, false).strength).toBe('advisory');
  });

  it('409 with no file is genuinely retryable', () => {
    const r = resolveRefusal(409, false);
    expect(r.outcome).toBe('retryable');
    expect(r.retry).toBe(true);
  });

  it('422 with no file is also retryable', () => {
    expect(resolveRefusal(422, false).retry).toBe(true);
  });

  it('403 and 404 are blocked, not retried', () => {
    for (const s of [403, 404]) {
      const r = resolveRefusal(s, false);
      expect(r.outcome).toBe('blocked');
      expect(r.retry).toBe(false);
    }
  });

  it('an unrecognised status is neither retried nor claimed as a rule', () => {
    const r = resolveRefusal(500, false);
    expect(r.outcome).toBe('unknown');
    expect(r.retry).toBe(false);
  });

  it('NEVER advises retrying once the Award file exists', () => {
    // The one invariant that must hold for every status code.
    for (const s of [400, 403, 404, 409, 422, 500, 502]) {
      expect(resolveRefusal(s, true).retry).toBe(false);
    }
  });
});

describe('counts — so growth is visible before it bites', () => {
  it('reports awards, distinct winners, and waiting claims', () => {
    const l = ledgerWith(
      [award('alex', 'e1'), award('sam', 'e2')],
      [entry('e1', 'alex'), entry('e2', 'sam'), entry('e3', 'robin')],
    );
    const c = counts(l);
    expect(c.awards).toBe(2);
    expect(c.winners).toBe(2);
    expect(c.pending).toBe(1);
  });
});
