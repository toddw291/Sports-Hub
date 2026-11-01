/**
 * Rebuild sports/data/snapshot.json from ESPN's public feeds.
 * No API key. Run from anywhere: node scripts/build-snapshot.mjs
 * Leaves the file alone when the games and scores have not changed.
 */

import { readFile, writeFile } from "node:fs/promises";
import { buildLiveSnapshot } from "../sports/js/api.js";

const target = new URL("../sports/data/snapshot.json", import.meta.url);

function comparable(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot));
  delete copy.updatedAt;
  return JSON.stringify(copy);
}

function summarize(snapshot) {
  for (const team of snapshot.teams) {
    const next = team.nextGame;
    const score = next
      ? `${next.away.abbr} ${next.away.score ?? "–"} @ ${next.home.abbr} ${next.home.score ?? "–"} (${next.status})`
      : "no upcoming game";
    console.log(`${team.shortName} ${team.record || ""} next: ${score}`.trim());
  }
  const upcoming = snapshot.ufc.nextEvent;
  console.log(upcoming
    ? `UFC next: ${upcoming.name} (${upcoming.fights.length} fights, ${upcoming.status})`
    : "UFC: no upcoming event in the window");
}

const fresh = await buildLiveSnapshot();
fresh.source = {
  name: "ESPN public scoreboard",
  mode: "snapshot",
  docs: "sports/data/README.md",
};

let previous = null;
try {
  previous = JSON.parse(await readFile(target, "utf8"));
} catch {
  previous = null;
}

if (previous && comparable(previous) === comparable(fresh)) {
  console.log(`Snapshot unchanged. Keeping updatedAt ${previous.updatedAt}`);
  summarize(fresh);
  process.exit(0);
}

await writeFile(target, `${JSON.stringify(fresh, null, 2)}\n`);
console.log(`Wrote ${target.pathname}`);
summarize(fresh);
