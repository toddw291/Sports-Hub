/**
 * Loads a snapshot. Live ESPN first. Saved JSON if the feed cannot be reached.
 * ESPN's public site API sends access-control-allow-origin: * so the phone
 * can request it directly. No key.
 */

import {
  TEAMS,
  assertSnapshot,
  endpointFor,
  normalizeTeam,
  normalizeUfc,
  ufcDateWindow,
} from "./normalize.js";

async function fetchJson(url, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`ESPN returned ${response.status} for ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function optionalJson(url, fetchImpl) {
  try {
    return await fetchJson(url, fetchImpl);
  } catch {
    return null;
  }
}

export async function buildLiveSnapshot(fetchImpl = globalThis.fetch, now = new Date()) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available");
  const window = ufcDateWindow(now);
  const nfl = TEAMS.find((team) => team.league === "NFL");
  const nba = TEAMS.find((team) => team.league === "NBA");
  const [schedules, nflScoreboard, nbaScoreboard, nflStandings, nbaStandings, ufcBoard] = await Promise.all([
    Promise.all(TEAMS.map((team) => fetchJson(endpointFor("schedule", team), fetchImpl))),
    optionalJson(endpointFor("scoreboard", nfl), fetchImpl),
    optionalJson(endpointFor("scoreboard", nba), fetchImpl),
    optionalJson(endpointFor("standings", nfl), fetchImpl),
    optionalJson(endpointFor("standings", nba), fetchImpl),
    fetchJson(endpointFor("ufc", null, window), fetchImpl),
  ]);

  const teams = TEAMS.map((team, index) => normalizeTeam({
    team,
    schedule: schedules[index],
    scoreboard: team.league === "NFL" ? nflScoreboard : nbaScoreboard,
    standings: team.league === "NFL" ? nflStandings : nbaStandings,
  }));
  const snapshot = {
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    timezone: "America/New_York",
    source: {
      name: "ESPN public scoreboard",
      mode: "live",
      docs: "sports/data/README.md",
    },
    teams,
    ufc: normalizeUfc(ufcBoard),
  };
  const problems = assertSnapshot(snapshot);
  if (problems.length) {
    const error = new Error(problems.join("; "));
    error.problems = problems;
    throw error;
  }
  return snapshot;
}

export function snapshotProblems(snapshot) {
  return assertSnapshot(snapshot);
}
