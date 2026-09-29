import { useCallback, useEffect, useState } from 'react';
import {
  loadConfig,
  readFile,
  listDir,
  identify,
  permission,
  canWrite,
  createEntry,
  issueAward,
  WriteRefused,
  type AppConfig,
  type TokenInfo,
} from './lib/github';
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
  type EntryState,
} from './lib/ledger';
import * as msg from './lib/messages';
import type { Message } from './lib/messages';
import './App.css';

const TOKEN_KEY = 'pd.token';

const STATE_LABEL: Record<EntryState, string> = {
  pending: 'Waiting',
  awarded: 'Won',
  rejected: 'Rejected',
  superseded: 'Superseded',
  withdrawn: 'Withdrawn',
};

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [ledger, setLedger] = useState<Ledger>(emptyLedger());
  const [who, setWho] = useState<TokenInfo | null>(null);
  const [mayWrite, setMayWrite] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [cfg, awardNames, entryNames] = await Promise.all([
      loadConfig(),
      listDir('data/awards'),
      listDir('data/entries'),
    ]);
    const awards = Object.fromEntries(
      await Promise.all(
        awardNames.map(async (n) => [n.replace(/\.json$/, ''), await readFile<Award>(`data/awards/${n}`)]),
      ),
    ) as Record<string, Award>;
    const entries = Object.fromEntries(
      await Promise.all(
        entryNames.map(async (n) => [n.replace(/\.json$/, ''), await readFile<Entry>(`data/entries/${n}`)]),
      ),
    ) as Record<string, Entry>;
    setConfig(cfg);
    setLedger({ awards, entries });
  }, []);

  useEffect(() => {
    reload()
      .catch((e) => setMessage({ tone: 'bad', headline: 'Could not load', detail: String(e.message ?? e) }))
      .finally(() => setLoading(false));
  }, [reload]);

  async function signIn(token: string) {
    try {
      const info = await identify(token);
      const perm = await permission(token);
      setWho(info);
      setMayWrite(canWrite(perm));
      localStorage.setItem(TOKEN_KEY, token);
      setMessage(
        info.overScoped
          ? msg.overScopedToken(info.scopes)
          : { tone: 'good', headline: `Signed in as ${info.name ?? info.login}`, detail: canWrite(perm) ? 'You can record claims and issue prizes.' : 'You have read access only.' },
      );
    } catch (e) {
      setMessage(msg.tokenProblem(String((e as Error).message)));
    }
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setWho(null);
    setMayWrite(false);
    setMessage({ tone: 'idle', headline: 'Signed out', detail: 'The token has been removed from this browser.' });
  }

  async function record(personId: string, eventId: string) {
    if (!who) return;
    const already = personHasWon(ledger, personId);
    const entry: Entry = {
      id: `e${Date.now().toString(36)}`,
      personId,
      eventId,
      recordedBy: who.login,
      recordedAt: new Date().toISOString(),
    };
    try {
      await createEntry(token(), entry);
      await reload();
      setMessage(
        already
          ? { tone: 'warn', headline: `Recorded — but ${personId} has already won`, detail: 'The claim is kept, because it may be true. It can never become a second prize, and it will show as superseded.' }
          : { tone: 'good', headline: 'Claim recorded', detail: 'Waiting for a distributor to look at it.' },
      );
    } catch (e) {
      setMessage({ tone: 'bad', headline: 'Could not record that', detail: String((e as Error).message) });
    }
  }

  async function issue(personId: string, entryId: string) {
    if (!who || !config) return;
    const name = config.people[personId]?.name ?? personId;
    if (config.distributors.includes(who.login) && who.login === personId) {
      return setMessage(msg.selfIssuance(personId));
    }
    const prizeId = Object.keys(config.prizes)[0];
    const left = remaining(ledger, config.prizes, prizeId);
    if (left <= 0) return setMessage(msg.prizeExhausted(config.prizes[prizeId].name, left));

    try {
      await issueAward(token(), {
        personId,
        prizeId,
        eventId: ledger.entries[entryId]?.eventId ?? '',
        entryId,
        issuedBy: who.login,
        issuedAt: new Date().toISOString(),
      });
      await reload();
      setMessage({ tone: 'good', headline: `${name} has won`, detail: 'One record written. Everything else on this page is worked out from it.' });
    } catch (e) {
      if (e instanceof WriteRefused) {
        await reload();
        return setMessage(msg.awardRefused(resolveRefusal(e.status, e.awardFileExists), personId, config.prizes[prizeId]?.name ?? 'prize'));
      }
      setMessage({ tone: 'bad', headline: 'Something went wrong', detail: String((e as Error).message) });
    }
  }

  const token = () => localStorage.getItem(TOKEN_KEY) ?? '';
  const isDistributor = !!who && !!config?.distributors.includes(who.login);
  const c = counts(ledger);

  if (loading) return <main className="wrap"><p className="muted">Loading the ledger…</p></main>;

  const waiting = Object.values(ledger.entries).filter((e) => entryState(ledger, e) === 'pending');

  return (
    <main className="wrap">
      <header>
        <h1>Prize distributor</h1>
        <p className="muted">
          One prize per person, ever. The repository is the record — this page only reads
          and writes it.
        </p>
      </header>

      {message && (
        <div className={`msg msg-${message.tone}`} role="status">
          <strong>{message.headline}</strong>
          <span>{message.detail}</span>
        </div>
      )}

      <section className="panel">
        <h2>You</h2>
        {who ? (
          <div className="row">
            <span>
              Signed in as <b>{who.name ?? who.login}</b> ({who.login})
            </span>
            <span className={mayWrite ? 'tag tag-ok' : 'tag tag-no'}>
              {mayWrite ? 'can write' : 'read only'}
            </span>
            {isDistributor && <span className="tag tag-office">distributor</span>}
            <button onClick={signOut}>Forget this token</button>
          </div>
        ) : (
          <div>
            <p className="muted">
              Everything here is readable without signing in. To record a claim or issue a
              prize, paste a fine-grained token for this repository.
            </p>
            <TokenForm onSubmit={signIn} />
            <p className="fine">
              Create one at github.com/settings/personal-access-tokens/new — this
              repository only, with <b>Contents: read and write</b>. Keep it for 90 days.
              It is kept in this browser only, and you can forget it at any time.
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>The record</h2>
        <div className="stats">
          <div><b>{c.awards}</b><span>prizes given</span></div>
          <div><b>{c.winners}</b><span>people won</span></div>
          <div><b>{c.pending}</b><span>waiting</span></div>
        </div>
        {Object.keys(ledger.awards).length === 0 ? (
          <p className="muted">No prizes given yet.</p>
        ) : (
          <ul className="plain">
            {Object.values(ledger.awards).map((a) => (
              <li key={a.personId}>
                <b>{config?.people[a.personId]?.name ?? a.personId}</b>
                <span className="muted"> — {config?.prizes[a.prizeId]?.name ?? a.prizeId}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {config && Object.keys(config.prizes).length > 0 && (
        <section className="panel">
          <h2>Prizes</h2>
          <ul className="plain">
            {Object.values(config.prizes).map((p) => (
              <li key={p.id}>
                <b>{p.name}</b>
                <span className="muted">
                  {' '}
                  — {remaining(ledger, config.prizes, p.id)} of {p.allocation} left
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Claims waiting</h2>
        {waiting.length === 0 ? (
          <p className="muted">Nothing is waiting.</p>
        ) : (
          <ul className="plain">
            {waiting.map((e) => (
              <li key={e.id}>
                <b>{config?.people[e.personId]?.name ?? e.personId}</b>
                <span className="muted"> — claimed the {e.eventId}</span>
                {mayWrite && isDistributor && (
                  <button onClick={() => issue(e.personId, e.id)}>Issue the prize</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {mayWrite && !isDistributor && waiting.length > 0 && (
          <p className="fine">Only a distributor can issue a prize.</p>
        )}
      </section>

      {config && mayWrite && (
        <section className="panel">
          <h2>Record a claim</h2>
          <RecordForm config={config} ledger={ledger} onRecord={record} />
        </section>
      )}

      <section className="panel">
        <h2>Every claim</h2>
        {Object.keys(ledger.entries).length === 0 ? (
          <p className="muted">No claims recorded yet.</p>
        ) : (
          <ul className="plain">
            {Object.values(ledger.entries).map((e) => {
              const s = entryState(ledger, e);
              return (
                <li key={e.id}>
                  <span className={`tag tag-${s}`}>{STATE_LABEL[s]}</span>
                  <b>{config?.people[e.personId]?.name ?? e.personId}</b>
                  <span className="muted"> — {e.eventId}, recorded by {e.recordedBy}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function TokenForm({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <form
      className="row"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (t.trim()) onSubmit(t.trim());
      }}
    >
      <input
        type="password"
        value={t}
        onChange={(ev) => setT(ev.target.value)}
        placeholder="github_pat_…"
        autoComplete="off"
        spellCheck={false}
      />
      <button className="primary" type="submit">Sign in</button>
    </form>
  );
}

function RecordForm({
  config,
  ledger,
  onRecord,
}: {
  config: AppConfig;
  ledger: Ledger;
  onRecord: (personId: string, eventId: string) => void;
}) {
  const [person, setPerson] = useState('');
  const [event, setEvent] = useState(config.events[0]?.id ?? '');
  const won = person ? personHasWon(ledger, person) : false;

  return (
    <form
      className="col"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (person) onRecord(person, event);
        setPerson('');
      }}
    >
      <label>
        Who won
        <select value={person} onChange={(ev) => setPerson(ev.target.value)} required>
          <option value="">Choose a person…</option>
          {Object.values(config.people).map((p) => (
            <option key={p.login} value={p.login}>{p.name}</option>
          ))}
        </select>
      </label>
      <label>
        What they won
        <select value={event} onChange={(ev) => setEvent(ev.target.value)}>
          {config.events.map((e) => (
            <option key={e.id} value={e.id}>{e.name} {e.year}</option>
          ))}
        </select>
      </label>
      {won && (
        <p className="warn-note">
          This person has already won. The claim will be recorded, but it can never
          become a second prize.
        </p>
      )}
      <button className="primary" type="submit" disabled={!person}>Record the claim</button>
    </form>
  );
}
