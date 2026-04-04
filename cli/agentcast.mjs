#!/usr/bin/env node
/**
 * AgentCast CLI - Query active agents from ac.800.works
 *
 * Usage:
 *   node cli/agentcast.mjs active [--days 7] [--limit 50] [--type casts|txs|all] [--json]
 *   node cli/agentcast.mjs stats
 */

const API = "https://ac.800.works/api";

// ── Arg parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || "active";

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}
const asJson = args.includes("--json");

// ── Helpers ──────────────────────────────────────────────────────────
function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

/**
 * Paginate through /api/casts or /api/transactions using cursor + since
 */
async function fetchAllPaginated(endpoint, sinceMs) {
  const results = [];
  let cursor = null;
  const perPage = 200;

  while (true) {
    const params = new URLSearchParams({ limit: String(perPage), since: String(sinceMs) });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${API}/${endpoint}?${params}`);
    if (!res.ok) throw new Error(`${endpoint} API error: ${res.status}`);
    const data = await res.json();

    const items = data.casts || data.transactions || [];
    results.push(...items);
    process.stdout.write(".");

    if (!data.nextCursor || items.length < perPage) break;
    cursor = data.nextCursor;
  }

  return results;
}

// ── Commands ─────────────────────────────────────────────────────────

async function active() {
  const days = parseInt(flag("days", "7"));
  const limit = parseInt(flag("limit", "50"));
  const type = flag("type", "all");
  const sinceMs = Date.now() - days * 86400000;

  process.stdout.write(`\n🤖 Active agents (last ${days} day${days > 1 ? "s" : ""}) `);

  let casts = [];
  let txs = [];

  if (type === "all" || type === "casts") {
    casts = await fetchAllPaginated("casts", sinceMs);
  }
  if (type === "all" || type === "txs") {
    txs = await fetchAllPaginated("transactions", sinceMs);
  }

  console.log(`\n  ${casts.length} casts, ${txs.length} txs\n`);

  // Aggregate by FID
  const agentActivity = new Map();

  for (const c of casts) {
    const fid = c.fid || c.account?.fid;
    if (!fid) continue;
    if (!agentActivity.has(fid)) {
      agentActivity.set(fid, {
        fid,
        username: c.account?.username || `fid:${fid}`,
        displayName: c.account?.displayName || "",
        casts: 0,
        txs: 0,
        lastSeen: c.createdAt,
      });
    }
    const a = agentActivity.get(fid);
    a.casts++;
    if (c.createdAt > a.lastSeen) a.lastSeen = c.createdAt;
  }

  for (const t of txs) {
    const fid = t.agent?.fid;
    if (!fid) continue;
    if (!agentActivity.has(fid)) {
      agentActivity.set(fid, {
        fid,
        username: t.agent?.farcasterAccount?.username || `fid:${fid}`,
        displayName: t.agent?.name || "",
        casts: 0,
        txs: 0,
        lastSeen: t.createdAt,
      });
    }
    const a = agentActivity.get(fid);
    a.txs++;
    if (t.createdAt > a.lastSeen) a.lastSeen = t.createdAt;
  }

  // Sort by total activity
  const sorted = [...agentActivity.values()]
    .sort((a, b) => b.casts + b.txs - (a.casts + a.txs))
    .slice(0, limit);

  if (asJson) {
    console.log(JSON.stringify(sorted, null, 2));
    return;
  }

  // Table output
  const nameW = 25;
  const userW = 22;
  console.log(
    `  ${"Name".padEnd(nameW)} ${"Username".padEnd(userW)} ${"Casts".padStart(6)} ${"TXs".padStart(6)} ${"Last Seen".padStart(10)}`
  );
  console.log(
    `  ${"─".repeat(nameW)} ${"─".repeat(userW)} ${"─".repeat(6)} ${"─".repeat(6)} ${"─".repeat(10)}`
  );

  for (const a of sorted) {
    console.log(
      `  ${truncate(a.displayName || a.username, nameW).padEnd(nameW)} ${truncate("@" + a.username, userW).padEnd(userW)} ${String(a.casts).padStart(6)} ${String(a.txs).padStart(6)} ${timeAgo(a.lastSeen).padStart(10)}`
    );
  }

  console.log(`\n  Total: ${sorted.length} active agents\n`);
}

async function stats() {
  const res = await fetch(`${API}/agents?limit=1`);
  const data = await res.json();

  console.log(`\n📊 AgentCast Stats`);
  console.log(`  Total agents (ERC-8004):  ${data.totalAgents}`);
  console.log(`  With FC accounts:         ${data.pagination.total}`);
  console.log();
}

// ── Run ──────────────────────────────────────────────────────────────
const commands = { active, stats };
const fn = commands[command];
if (!fn) {
  console.error(`Unknown command: ${command}`);
  console.error(
    `Usage: node cli/agentcast.mjs [active|stats] [--days N] [--limit N] [--type casts|txs|all] [--json]`
  );
  process.exit(1);
}
fn().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
