// PROTOTYPE — throwaway. Answers: does the create-without-sha guard actually
// enforce the one-Award cap against concurrent writers, and what does the
// loser actually receive? Runs against the real GitHub API.
const OWNER = "DurgaPrasadReddyV";
const REPO = "prize-distributor";
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

// A clearly-marked throwaway path, wiped at the end of the run.
const PREFIX = "data/prototype-scratch";
const token = process.env.GH_TOKEN;

const api = (path, opts = {}) =>
  fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

const b64 = (s) => Buffer.from(s).toString("base64");

async function put(path, body) {
  const res = await api(`/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function get(path) {
  const res = await api(`/contents/${path}`);
  if (res.status === 404) return { status: 404, json: null };
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const award = (personId, prizeId, entryId) => ({
  message: `prototype: award ${personId}`,
  content: b64(JSON.stringify({
    personId, prizeId, entryId,
    issuedBy: "prototype", issuedAt: new Date().toISOString(),
  }, null, 2)),
});

async function cleanup() {
  for (const p of [`${PREFIX}/concurrent.json`, `${PREFIX}/dblclick.json`]) {
    const cur = await get(p);
    if (cur.status === 200) {
      await api(`/contents/${p}`, {
        method: "DELETE",
        body: JSON.stringify({ message: "prototype: cleanup", sha: cur.json.sha }),
      });
    }
  }
  // Remove the scratch directory by deleting the tree via commits API is more
  // work than it is worth; delete each known file instead.
}

const results = [];
const log = (scenario, detail) => {
  results.push({ scenario, ...detail });
  console.log(`\n### ${scenario}`);
  for (const [k, v] of Object.entries(detail)) {
    console.log(`  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  }
};

(async () => {
  await cleanup();

  // ---- SCENARIO 1: two Distributors issue to the same Person simultaneously.
  {
    const body = award("proto-person-1", "proto-prize", "proto-entry-1");
    const [a, b] = await Promise.all([
      put(`${PREFIX}/concurrent.json`, body),
      put(`${PREFIX}/concurrent.json`, body),
    ]);
    const statuses = [a.status, b.status].sort();
    log("1. Two Distributors issue to the same Person, simultaneously", {
      statuses: statuses.join(" and "),
      winner: a.status === 201 ? "first call" : b.status === 201 ? "second call" : "neither",
      loserMessage:
        (a.status > 399 ? a : b).json?.message ??
        (a.status === 201 ? b : a).json?.message,
    });
  }

  // ---- SCENARIO 2: the Distributor double-clicks "issue".
  {
    const body = award("proto-person-2", "proto-prize", "proto-entry-2");
    const first = await put(`${PREFIX}/dblclick.json`, body);
    const second = await put(`${PREFIX}/dblclick.json`, body); // no sha: a create
    log("2. Same Distributor clicks issue twice (retry after timeout)", {
      first: first.status,
      second: second.status,
      secondMessage: second.json?.message,
      note: "second is a CREATE against a path that now exists",
    });
  }

  // ---- SCENARIO 3: can we tell 'already won' from 'lost a race'?
  {
    // Simulate the two possible 409s and check the resolution strategy:
    // after any refusal, does the file exist? That is the only question we ask.
    const r = await get(`${PREFIX}/concurrent.json`);
    const exists = r.status === 200;
    log("3. Resolving a refusal by reading the file", {
      "file exists": exists,
      conclusion: exists
        ? "Already Won — the rule held, do NOT retry"
        : "genuinely failed — safe to retry",
    });
  }

  // ---- SCENARIO 4: two Contributors edit the same pending Entry.
  {
    const path = `${PREFIX}/entry-edit.json`;
    const created = await put(path, {
      message: "prototype: create entry",
      content: b64(JSON.stringify({ entryId: "e1", personId: "p1", state: "pending", v: 1 })),
    });
    const sha = created.json?.content?.sha;
    const [x, y] = await Promise.all([
      put(path, { message: "prototype: edit A", content: b64("{}"), sha }),
      put(path, { message: "prototype: edit B", content: b64("{}"), sha }),
    ]);
    log("4. Two Contributors edit the same pending Entry simultaneously", {
      statuses: [x.status, y.status].sort().join(" and "),
      loserMessage: (x.status > 399 ? x : y).json?.message,
      "-> meaning": "on a pending Entry, 409 means a person beat you to it",
    });
  }

  // ---- SCENARIO 5: does a '409 with no sha' ever happen on create?
  {
    // The claim in ticket #6 is that 409 means Already Won. But create-without-sha
    // against an existing path is documented as 422. Which does a real race give?
    const body = award("proto-person-3", "proto-prize", "proto-entry-3");
    const path = `${PREFIX}/concurrent.json`; // already exists from scenario 1
    const r = await put(path, body);
    log("5. A late create against a path that already exists", {
      status: r.status,
      message: r.json?.message,
      "-> meaning": r.status === 422
        ? "ALREADY WON, reported as 422 not 409"
        : `reported as ${r.status}`,
    });
  }

  await cleanup();
  console.log("\n=== scratch paths cleaned ===");
})();
