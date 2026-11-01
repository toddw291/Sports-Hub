/**
 * Turns ESPN's public scoreboard JSON into the snapshot shape documented
 * in sports/data/README.md. No browser APIs, so the refresh script can use it too.
 */

export const TIMEZONE = "America/New_York";

export const TEAMS = [
  {
    id: "colts",
    league: "NFL",
    sport: "football",
    leagueSlug: "nfl",
    espnTeamId: "11",
    name: "Indianapolis Colts",
    shortName: "Colts",
    abbr: "IND",
  },
  {
    id: "pacers",
    league: "NBA",
    sport: "basketball",
    leagueSlug: "nba",
    espnTeamId: "11",
    name: "Indiana Pacers",
    shortName: "Pacers",
    abbr: "IND",
  },
  {
    id: "bengals",
    league: "NFL",
    sport: "football",
    leagueSlug: "nfl",
    espnTeamId: "4",
    name: "Cincinnati Bengals",
    shortName: "Bengals",
    abbr: "CIN",
  },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function readScore(competitor) {
  if (!competitor) return null;
  const score = competitor.score;
  if (score == null) return null;
  if (typeof score === "number" || typeof score === "string") return String(score);
  if (typeof score === "object" && score.displayValue != null) return String(score.displayValue);
  return null;
}

export function readStatus(comp) {
  const type = comp?.status?.type || {};
  const name = type.name || "";
  const state = type.state || "";
  const detail = type.shortDetail || type.detail || type.description || "";
  let status = "scheduled";
  if (state === "in" || /IN_PROGRESS|HALFTIME|END_PERIOD/.test(name)) status = "in";
  else if (state === "post" || type.completed || /FINAL|FULL_TIME/.test(name)) status = "final";
  else if (/POSTPON/i.test(name) || /postpon/i.test(detail)) status = "postponed";
  else if (/CANCEL/i.test(name) || /cancel/i.test(detail)) status = "canceled";
  const timeValid = comp?.timeValid !== false && !/^tbd$/i.test(String(detail).trim());
  return { status, detail, timeValid };
}

export function bestLogo(team, league) {
  const logos = asArray(team?.logos);
  const hrefs = logos
    .map((logo) => (typeof logo === "string" ? logo : logo?.href))
    .filter(Boolean);
  const preferred = hrefs.find((href) => /\/500\//.test(href) && !/dark|grayscale|scoreboard/i.test(href));
  if (preferred) return preferred;
  if (typeof team?.logo === "string") return team.logo;
  if (hrefs[0]) return hrefs[0];
  if (team?.abbreviation && league) {
    return `https://a.espncdn.com/i/teamlogos/${league.toLowerCase()}/500/${String(team.abbreviation).toLowerCase()}.png`;
  }
  return null;
}

function readBroadcast(comp) {
  for (const item of asArray(comp?.broadcasts)) {
    if (Array.isArray(item.names) && item.names.length) return item.names.join(", ");
    if (item.media?.shortName) return item.media.shortName;
  }
  return null;
}

function readSide(competitor, league) {
  const team = competitor?.team || {};
  return {
    id: team.id != null ? String(team.id) : null,
    abbr: team.abbreviation || "",
    name: team.displayName || team.name || team.abbreviation || "TBD",
    shortName: team.shortDisplayName || team.abbreviation || "",
    score: readScore(competitor),
    winner: competitor?.winner === true,
    logo: bestLogo(team, league),
  };
}

function indexEvents(board) {
  const map = new Map();
  for (const event of asArray(board?.events)) map.set(String(event.id), event);
  return map;
}

export function normalizeGame(event, league, ourTeamId, liveEvent) {
  const base = event?.competitions?.[0];
  const live = liveEvent?.competitions?.[0];
  const comp = live || base;
  if (!comp) return null;
  const competitors = asArray(comp.competitors);
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const homeSide = readSide(home, league);
  const awaySide = readSide(away, league);
  if (live && base) {
    const baseHome = asArray(base.competitors).find((c) => c.homeAway === "home");
    const baseAway = asArray(base.competitors).find((c) => c.homeAway === "away");
    if (homeSide.score == null) homeSide.score = readScore(baseHome);
    if (awaySide.score == null) awaySide.score = readScore(baseAway);
    if (!homeSide.logo) homeSide.logo = bestLogo(baseHome?.team, league);
    if (!awaySide.logo) awaySide.logo = bestLogo(baseAway?.team, league);
  }

  const status = readStatus(live || base);
  if (status.status !== "in" && status.status !== "final") {
    homeSide.score = null;
    awaySide.score = null;
    homeSide.winner = false;
    awaySide.winner = false;
  }
  const oursId = String(ourTeamId);
  let ours = null;
  if (homeSide.id === oursId) ours = "home";
  else if (awaySide.id === oursId) ours = "away";

  return {
    id: String(event.id || liveEvent?.id || ""),
    start: event.date || comp.date || null,
    status: status.status,
    detail: status.detail,
    timeValid: status.timeValid,
    venue: (live?.venue || base?.venue)?.fullName || null,
    broadcast: readBroadcast(live) || readBroadcast(base),
    neutralSite: Boolean((live || base).neutralSite),
    home: homeSide,
    away: awaySide,
    ours,
  };
}

function stat(entry, name) {
  const found = asArray(entry?.stats).find((item) => item.name === name || item.abbreviation === name);
  return found?.displayValue ?? null;
}

function standingRow(entry, ourAbbr) {
  const wins = stat(entry, "wins");
  const losses = stat(entry, "losses");
  const ties = stat(entry, "ties");
  return {
    abbr: entry.team?.abbreviation || "",
    name: entry.team?.shortDisplayName || entry.team?.displayName || "",
    fullName: entry.team?.displayName || "",
    wins: wins == null ? null : Number(wins),
    losses: losses == null ? null : Number(losses),
    ties: ties == null ? null : Number(ties),
    pct: stat(entry, "winPercent"),
    streak: stat(entry, "streak"),
    diff: stat(entry, "pointDifferential"),
    seed: stat(entry, "playoffSeed"),
    logo: bestLogo(entry.team, null),
    ours: entry.team?.abbreviation === ourAbbr,
  };
}

export function findStandingGroup(standings, abbr) {
  if (!standings) return null;
  for (const conf of asArray(standings.children)) {
    const divisions = asArray(conf.children).length ? conf.children : [conf];
    for (const division of divisions) {
      const entries = asArray(division.standings?.entries);
      if (!entries.some((entry) => entry.team?.abbreviation === abbr)) continue;
      return {
        name: division.name,
        conference: conf.name,
        rows: entries.map((entry) => standingRow(entry, abbr)),
      };
    }
  }
  return null;
}

export function formatRecord(wins, losses, ties) {
  if (wins == null || losses == null || Number.isNaN(wins) || Number.isNaN(losses)) return null;
  if (ties) return `${wins}-${losses}-${ties}`;
  return `${wins}-${losses}`;
}

function recordFromGames(games, abbr) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const game of games) {
    if (game.status !== "final") continue;
    const us = game.home.abbr === abbr ? game.home : game.away.abbr === abbr ? game.away : null;
    const them = us && us === game.home ? game.away : game.home;
    if (!us || us.score == null || !them || them.score == null) continue;
    const ours = Number(us.score);
    const theirs = Number(them.score);
    if (Number.isNaN(ours) || Number.isNaN(theirs)) continue;
    if (ours > theirs) wins += 1;
    else if (ours < theirs) losses += 1;
    else ties += 1;
  }
  return { wins, losses, ties };
}

export function pickNext(games) {
  return games.find((game) => game.status === "in")
    || games.find((game) => game.status === "scheduled" || game.status === "postponed")
    || null;
}

export function pickRecent(games, limit = 5) {
  return games.filter((game) => game.status === "final").slice().reverse().slice(0, limit);
}

export function normalizeTeam({ team, schedule, scoreboard, standings }) {
  const liveById = indexEvents(scoreboard);
  const games = [];
  for (const event of asArray(schedule?.events)) {
    const game = normalizeGame(event, team.league, team.espnTeamId, liveById.get(String(event.id)));
    if (game) games.push(game);
  }
  games.sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const group = findStandingGroup(standings, team.abbr);
  const ourRow = group?.rows.find((row) => row.ours);
  const computed = recordFromGames(games, team.abbr);
  const wins = ourRow?.wins ?? computed.wins;
  const losses = ourRow?.losses ?? computed.losses;
  const ties = ourRow?.ties ?? computed.ties;
  const identity = schedule?.team || {};

  return {
    id: team.id,
    league: team.league,
    name: identity.displayName || team.name,
    shortName: team.shortName,
    abbr: identity.abbreviation || team.abbr,
    espnTeamId: String(team.espnTeamId),
    logo: bestLogo(identity, team.league)
      || `https://a.espncdn.com/i/teamlogos/${team.leagueSlug}/500/${team.abbr.toLowerCase()}.png`,
    record: formatRecord(wins, losses, ties),
    wins,
    losses,
    ties,
    streak: ourRow?.streak || null,
    seed: ourRow?.seed || null,
    standingName: group?.name || null,
    conference: group?.conference || null,
    standings: group?.rows || [],
    byeWeek: schedule?.byeWeek ?? null,
    nextGame: pickNext(games),
    recent: pickRecent(games, 5),
    schedule: games,
  };
}

const METHOD_RULES = [
  [/decision/i, "Decision"],
  [/submission/i, "Submission"],
  [/no contest/i, "No Contest"],
  [/draw/i, "Draw"],
  [/kotko|ko\/tko|\btko\b|\bko\b/i, "KO/TKO"],
];

export function fightMethod(comp) {
  const texts = asArray(comp?.details).map((detail) => detail?.type?.text || "");
  const unofficial = texts.filter((text) => /unofficial winner/i.test(text));
  for (const text of unofficial) {
    for (const [pattern, label] of METHOD_RULES) {
      if (pattern.test(text)) return label;
    }
  }
  return null;
}

function formatVenue(event, comp) {
  const venue = comp?.venue || event?.venues?.[0];
  if (!venue) return null;
  const city = [venue.address?.city, venue.address?.state].filter(Boolean).join(", ");
  if (venue.fullName && city) return `${venue.fullName}, ${city}`;
  return venue.fullName || city || null;
}

function normalizeFight(comp, meta) {
  const status = readStatus(comp);
  const method = status.status === "final" ? fightMethod(comp) : null;
  let finish = null;
  if (method && method !== "Decision" && method !== "Draw" && method !== "No Contest") {
    const period = comp.status?.period;
    const clock = comp.status?.displayClock;
    if (period) finish = clock ? `R${period} ${clock}` : `R${period}`;
  }
  return {
    id: String(comp.id || ""),
    weightClass: comp.type?.abbreviation || null,
    status: status.status,
    detail: status.detail,
    method,
    finish,
    mainEvent: meta.mainEvent,
    card: meta.card,
    fighters: asArray(comp.competitors).map((competitor) => {
      const athlete = competitor.athlete || {};
      const record = asArray(competitor.records).find((item) => item.type === "total" || item.name === "overall");
      return {
        name: athlete.displayName || athlete.fullName || "TBA",
        record: record?.summary || null,
        winner: competitor.winner === true,
        flag: athlete.flag?.href || null,
        country: athlete.flag?.alt || null,
      };
    }),
  };
}

export function normalizeUfcEvent(event) {
  const comps = asArray(event?.competitions);
  const mainCount = Math.min(5, comps.length);
  const fights = comps.map((comp, index) => normalizeFight(comp, {
    mainEvent: comps.length > 0 && index === comps.length - 1,
    card: comps.length - 1 - index < mainCount ? "main" : "prelim",
  })).reverse();
  const mainComp = comps[comps.length - 1];
  const status = readStatus({ status: event.status, timeValid: true });
  return {
    id: String(event.id || ""),
    name: event.name || "UFC",
    shortName: event.shortName || event.name || "UFC",
    start: event.date || null,
    status: status.status,
    detail: status.detail,
    timeValid: status.timeValid,
    venue: formatVenue(event, mainComp),
    broadcast: readBroadcast(mainComp) || readBroadcast(comps[0]),
    fights,
  };
}

export function normalizeUfc(board) {
  const events = asArray(board?.events)
    .filter((event) => typeof event?.name === "string" && event.name.startsWith("UFC "))
    .map(normalizeUfcEvent)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return {
    id: "ufc",
    league: "UFC",
    name: "UFC",
    shortName: "UFC",
    nextEvent: events.find((event) => event.status === "in")
      || events.find((event) => event.status === "scheduled" || event.status === "postponed")
      || null,
    recent: events.filter((event) => event.status === "final").slice().reverse().slice(0, 4),
    schedule: events,
  };
}

export function ufcDateWindow(now = new Date()) {
  const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000);
  const ymd = (date) => {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };
  return { start: ymd(start), end: ymd(end) };
}

export function endpointFor(kind, team, window) {
  if (kind === "schedule") {
    return `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.leagueSlug}/teams/${team.espnTeamId}/schedule`;
  }
  if (kind === "scoreboard") {
    return `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.leagueSlug}/scoreboard`;
  }
  if (kind === "standings") {
    return `https://site.api.espn.com/apis/v2/sports/${team.sport}/${team.leagueSlug}/standings?level=3`;
  }
  if (kind === "ufc") {
    return `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${window.start}-${window.end}`;
  }
  throw new Error(`Unknown endpoint ${kind}`);
}

export function assertSnapshot(snapshot) {
  const problems = [];
  if (!snapshot || snapshot.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  const teams = asArray(snapshot?.teams);
  for (const id of ["colts", "pacers", "bengals"]) {
    const team = teams.find((item) => item.id === id);
    if (!team) {
      problems.push(`missing team ${id}`);
      continue;
    }
    if (!Array.isArray(team.schedule) || team.schedule.length === 0) problems.push(`${id} schedule is empty`);
  }
  if (!snapshot?.ufc || !Array.isArray(snapshot.ufc.schedule) || snapshot.ufc.schedule.length === 0) {
    problems.push("ufc schedule is empty");
  }
  return problems;
}
