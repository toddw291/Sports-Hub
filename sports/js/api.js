/**
 * Loads a snapshot. Live ESPN first. Saved JSON if the feed cannot be reached.
 * ESPN's public site API sends access-control-allow-origin: * so the phone
 * can request it directly. No key.
 */

import {
  TEAMS,
  assertSnapshot,
  endpointFor,
  mergeScheduleFeeds,
  normalizeTeam,
  normalizeUfc,
  scheduleHasOpenGame,
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

function scheduleYear(schedule, now) {
  const year = Number(schedule?.season?.year);
  return Number.isFinite(year) ? year : now.getUTCFullYear();
}

async function loadSchedule(team, fetchImpl, now) {
  const primary = await fetchJson(endpointFor("schedule", team), fetchImpl);
  if (team.league !== "MLB") return primary;
  const events = Array.isArray(primary?.events) ? primary.events : [];
  if (events.length && scheduleHasOpenGame(primary)) return primary;
  const year = scheduleYear(primary, now);
  const regular = events.length
    ? primary
    : await fetchJson(endpointFor("schedule", team, { season: year, seasontype: 2 }), fetchImpl);
  if (scheduleHasOpenGame(regular)) return regular;
  const upcoming = await optionalJson(
    endpointFor("schedule", team, { season: year + 1, seasontype: 2 }),
    fetchImpl,
  );
  return upcoming?.events?.length ? mergeScheduleFeeds(regular, upcoming) : regular;
}

export async function buildLiveSnapshot(fetchImpl = globalThis.fetch, now = new Date()) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is not available");
  const window = ufcDateWindow(now);
  const leagues = [];
  for (const team of TEAMS) {
    if (!leagues.some((item) => item.league === team.league)) leagues.push(team);
  }
  const [schedules, boards, tables, injuryFeeds, ufcBoard] = await Promise.all([
    Promise.all(TEAMS.map((team) => loadSchedule(team, fetchImpl, now))),
    Promise.all(leagues.map((team) => optionalJson(endpointFor("scoreboard", team), fetchImpl))),
    Promise.all(leagues.map((team) => optionalJson(endpointFor("standings", team), fetchImpl))),
    Promise.all(TEAMS.map((team) => optionalJson(endpointFor("injuries", team), fetchImpl))),
    fetchJson(endpointFor("ufc", null, window), fetchImpl),
  ]);
  const scoreboardByLeague = new Map(leagues.map((team, index) => [team.league, boards[index]]));
  const standingsByLeague = new Map(leagues.map((team, index) => [team.league, tables[index]]));

  const teams = TEAMS.map((team, index) => normalizeTeam({
    team,
    schedule: schedules[index],
    scoreboard: scoreboardByLeague.get(team.league),
    standings: standingsByLeague.get(team.league),
    injuries: injuryFeeds[index],
    now,
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
    ufc: normalizeUfc(ufcBoard, now),
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
