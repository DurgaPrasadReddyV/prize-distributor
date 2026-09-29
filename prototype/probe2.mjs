// PROTOTYPE — throwaway. Narrows the refusal semantics on the Award path.
// Scenario 1 of the first probe showed a race yields 409, but a *late* create
// yields 422. Both mean "already won". This probe establishes the decision
// table the app must actually implement.
const OWNER = "DurgaPrasadReddyV";
const REPO = "prize-distributor";
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
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
  const res = await api(`/contents/${path}`, { method: "PUT", body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function get(path) {
  const res = await api(`/contents/${path}`);
  return res.status === 404 ? { status: 404 } : { status: res.status, json: await res.json().catch(() => ({})) };
}
async function del(path, sha) {
  return api(`/contents/${path}`, { method: "DELETE", body: JSON.stringify({ message: "prototype: cleanup", sha }) });
}

const body = (n) => ({
  message: `prototype: award ${n}`,
  content: b64(JSON.stringify({ personId: `p${n}`, issuedAt: new Date().toISOString() })),
});

(async () => {
  // --- A: a genuine race. Both omit sha. What does the loser get?
  const racePath = `${PREFIX}/race.json`;
  await (async () => { const g = await get(racePath); if (g.status === 200) await del(racePath, g.json.sha); })();
  const [a, b] = await Promise.all([put(racePath, body("race")), put(racePath, body("race"))]);
  const loser = a.status > 399 ? a : b;
  console.log("A. genuine race, both omit sha");
  console.log(`   statuses : ${a.status} / ${b.status}`);
  console.log(`   loser msg: ${JSON.stringify(loser.json?.message)}`);
  console.log(`   docs say : 409 = "does not match <sha>"; 422 = "\"sha\" wasn't supplied"`);
  console.log(`   => race loser is reported as: ${loser.status === 409 ? "409" : loser.status === 422 ? "422" : loser.status}`);

  // --- B: a late create, strictly after the winner committed.
  const late = await put(racePath, body("race"));
  console.log("\nB. late create, after the winner already committed");
  console.log(`   status   : ${late.status}`);
  console.log(`   message  : ${JSON.stringify(late.json?.message)}`);

  // --- C: is 409 reproducible at all on a create path? Force it by racing again.
  const race2 = `${PREFIX}/race2.json`;
  const [c, d] = await Promise.all([put(race2, body("race2")), put(race2, body("race2"))]);
  console.log("\nC. second race, to see if 409 or 409/422 varies");
  console.log(`   statuses : ${c.status} / ${d.status}`);

  // --- D: an update with a STALE sha. This is the 'loser' case for Entry edits.
  const stale = await put(race2, { message: "prototype: stale", content: b64("{}"), sha: "0".repeat(40) });
  console.log("\nD. update with a deliberately stale sha");
  console.log(`   status   : ${stale.status}`);
  console.log(`   message  : ${JSON.stringify(stale.json?.message)}`);

  // --- E: what does a 404 on read look like (the 'file absent -> retryable' branch)?
  const absent = await get(`${PREFIX}/never-existed.json`);
  console.log("\nE. reading a path that does not exist");
  console.log(`   status   : ${absent.status}`);

  for (const p of [racePath, race2]) { const g = await get(p); if (g.status === 200) await del(p, g.json.sha); }
  console.log("\n=== scratch paths cleaned ===");
})();
