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
    id: "reds",
    league: "MLB",
    sport: "baseball",
    leagueSlug: "mlb",
    espnTeamId: "17",
    name: "Cincinnati Reds",
    shortName: "Reds",
    abbr: "CIN",
  },
];

export const SEASON_LABELS = {
  colts: ["Preseason", "Regular season", "Bye", "Playoffs", "Offseason"],
  pacers: ["Preseason", "Regular season", "NBA Cup", "Play-in", "Playoffs", "Offseason"],
  reds: ["Offseason", "Spring training", "Regular season", "Postseason"],
};

export const UFC_SEASON_LABEL = "Fight week";
export const FIGHT_WEEK_DAYS = 7;

export const PHASES = [
  "Pregame",
  "In progress",
  "Halftime",
  "End of period",
  "Overtime",
  "Delayed",
  "Final",
];

export const PHASE_STATUS = {
  Pregame: ["scheduled"],
  "In progress": ["in"],
  Halftime: ["in"],
  "End of period": ["in"],
  Overtime: ["in"],
  Delayed: ["scheduled", "in"],
  Final: ["final"],
};

export const PHASE_BY_STATUS_NAME = {
  STATUS_HALFTIME: "Halftime",
  STATUS_END_PERIOD: "End of period",
  STATUS_END_OF_PERIOD: "End of period",
  STATUS_DELAYED: "Delayed",
  STATUS_RAIN_DELAY: "Delayed",
  STATUS_SUSPENDED: "Delayed",
  STATUS_OVERTIME: "Overtime",
};

export const REGULATION_PERIODS = { NFL: 4, NBA: 4, MLB: 9 };

export const AVAILABILITY_STATUSES = [
  "Out",
  "IR",
  "IL",
  "Suspended",
  "Doubtful",
  "Questionable",
  "Day-to-day",
  "Active",
];

export const STATUS_RANK = {
  Out: 0,
  IR: 1,
  IL: 2,
  Suspended: 3,
  Doubtful: 4,
  Questionable: 5,
  "Day-to-day": 6,
  Active: 7,
};

// Active is not a rule. Pins with an unmapped status are stored as Active, and every other unmapped row is dropped.
export const STATUS_RULES = [
  [/^out$/i, "Out"],
  [/^doubtful$/i, "Doubtful"],
  [/^questionable$/i, "Questionable"],
  [/^day-to-day$/i, "Day-to-day"],
  [/^injured reserve$/i, "IR"],
  [/^injured list$/i, "IL"],
  [/^\d+-day-il$/i, "IL"],
  [/^il$/i, "IL"],
  [/^suspension$/i, "Suspended"],
  [/^suspended$/i, "Suspended"],
];

export const PINS = {
  colts: [
    { name: "Daniel Jones", position: "QB" },
    { name: "Jonathan Taylor", position: "RB" },
    { name: "Alec Pierce", position: "WR" },
    { name: "Tyler Warren", position: "TE" },
  ],
  pacers: [
    { name: "Tyrese Haliburton", position: "G" },
    { name: "Pascal Siakam", position: "F" },
    { name: "Bennedict Mathurin", position: "G" },
    { name: "T.J. McConnell", position: "G" },
    { name: "Andrew Nembhard", position: "G" },
  ],
  reds: [
    { name: "Elly De La Cruz", position: "SS" },
    { name: "Hunter Greene", position: "SP" },
  ],
};

const CUP_NOTE = /nba cup/i;
const PLAYIN_NOTE = /play-?in|play in/i;
const SPRING_NAME = /spring/i;

const SEASON_TYPE_LABELS = {
  colts: { 1: "Preseason", 2: "Regular season", 3: "Playoffs" },
  pacers: { 1: "Preseason", 2: "Regular season", 3: "Playoffs" },
  reds: { 1: "Spring training", 2: "Regular season", 3: "Postseason" },
};

const TODAY_NEXT_RANK = { scheduled: 0, postponed: 1, final: 2 };

const easternDate = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

export function normalizeGame(event, league, ourTeamId, liveEvent, now = new Date()) {
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

  const status = readStatus(comp);
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

  const start = event.date || comp.date || null;
  return {
    id: String(event.id || liveEvent?.id || ""),
    start,
    status: status.status,
    detail: status.detail,
    timeValid: status.timeValid,
    phase: readPhase(status, comp, league, start, now),
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

// A final stays nextGame through the rest of that Eastern date so phase Final can show on the next card.
export function pickNext(games, now = new Date()) {
  const live = games.find((game) => game.status === "in");
  if (live) return live;
  const today = easternYmd(now);
  const todayGames = today
    ? games.filter((game) => easternYmd(game.start) === today && Object.hasOwn(TODAY_NEXT_RANK, game.status))
    : [];
  if (todayGames.length) {
    return todayGames.slice().sort((a, b) => {
      const rank = TODAY_NEXT_RANK[a.status] - TODAY_NEXT_RANK[b.status];
      if (rank !== 0) return rank;
      return String(a.start).localeCompare(String(b.start));
    })[0];
  }
  return games.find((game) => game.status === "scheduled" || game.status === "postponed") || null;
}

export function pickRecent(games, limit = 5) {
  return games.filter((game) => game.status === "final").slice().reverse().slice(0, limit);
}

export function normalizeTeam({ team, schedule, scoreboard, standings, injuries = null, now = new Date() }) {
  const liveById = indexEvents(scoreboard);
  const games = [];
  for (const event of asArray(schedule?.events)) {
    const game = normalizeGame(event, team.league, team.espnTeamId, liveById.get(String(event.id)), now);
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
    seasonState: seasonStateForTeam({
      id: team.id,
      espnTeamId: team.espnTeamId,
      byeWeek: schedule?.byeWeek ?? null,
      events: schedule?.events,
      games,
      scoreboard,
      now,
    }),
    availability: normalizeAvailability(team.id, injuries, team.espnTeamId),
    nextGame: pickNext(games, now),
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
    note: fightNote(comp, status),
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

export function normalizeUfc(board, now = new Date()) {
  const events = asArray(board?.events)
    .filter((event) => typeof event?.name === "string" && event.name.startsWith("UFC "))
    .map(normalizeUfcEvent)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return {
    id: "ufc",
    league: "UFC",
    name: "UFC",
    shortName: "UFC",
    seasonState: seasonStateForUfc({ schedule: events }, now),
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

export function scheduleHasOpenGame(schedule) {
  return asArray(schedule?.events).some((event) => {
    const state = event?.competitions?.[0]?.status?.type?.state || "";
    return state === "pre" || state === "in";
  });
}

export function mergeScheduleFeeds(base, extra) {
  const events = asArray(base?.events).slice();
  const ids = new Set(events.map((event) => String(event.id)));
  for (const event of asArray(extra?.events)) {
    if (!ids.has(String(event.id))) events.push(event);
  }
  return {
    ...(base || {}),
    team: base?.team || extra?.team || null,
    byeWeek: base?.byeWeek ?? extra?.byeWeek ?? null,
    events,
  };
}

export function endpointFor(kind, team, extra) {
  if (kind === "schedule") {
    const params = new URLSearchParams();
    if (extra?.season != null) params.set("season", String(extra.season));
    if (extra?.seasontype != null) params.set("seasontype", String(extra.seasontype));
    const qs = params.toString();
    return `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.leagueSlug}/teams/${team.espnTeamId}/schedule${qs ? `?${qs}` : ""}`;
  }
  if (kind === "scoreboard") {
    return `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.leagueSlug}/scoreboard`;
  }
  if (kind === "standings") {
    return `https://site.api.espn.com/apis/v2/sports/${team.sport}/${team.leagueSlug}/standings?level=3`;
  }
  if (kind === "ufc") {
    return `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${extra.start}-${extra.end}`;
  }
  if (kind === "injuries") {
    return `https://site.api.espn.com/apis/site/v2/sports/${team.sport}/${team.leagueSlug}/injuries`;
  }
  throw new Error(`Unknown endpoint ${kind}`);
}

export function easternYmd(isoOrDate) {
  if (isoOrDate == null || isoOrDate === "") return null;
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return null;
  const parts = easternDate.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

export function easternDayDiff(iso, now) {
  const start = easternYmd(iso);
  const today = easternYmd(now);
  if (!start || !today) return null;
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.round((startUtc - todayUtc) / 86400000);
}

export function pinKey(name) {
  return String(name ?? "").toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export function readPhase(status, comp, league, start, now) {
  if (!start) return null;
  const coarse = status?.status;
  const startDay = easternYmd(start);
  const today = easternYmd(now);
  const gameDay = coarse === "in" || (startDay != null && startDay === today && coarse !== "canceled");
  if (!gameDay) return null;
  if (coarse === "postponed" || coarse === "canceled") return null;

  const name = comp?.status?.type?.name || "";
  const detail = status?.detail || "";
  if (coarse !== "final" && Object.hasOwn(PHASE_BY_STATUS_NAME, name)) return PHASE_BY_STATUS_NAME[name];
  if (/DELAY|RAIN_DELAY|SUSPEND/.test(name)) return "Delayed";
  if (/halftime/i.test(detail)) return "Halftime";
  if (/END_PERIOD/.test(name) || /end of/i.test(detail)) return "End of period";
  if (coarse === "final") return "Final";
  if (coarse === "in" && /overtime|\bOT\b/i.test(`${name} ${detail}`)) return "Overtime";
  const regulation = REGULATION_PERIODS[league];
  const period = Number(comp?.status?.period);
  if (coarse === "in" && regulation != null && period > regulation) return "Overtime";
  if (coarse === "in") return "In progress";
  const startMs = new Date(start).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (coarse === "scheduled" && status?.timeValid !== false && Number.isFinite(startMs) && startMs <= nowMs) {
    return "Delayed";
  }
  if (coarse === "scheduled") return "Pregame";
  return null;
}

export function eventClues(event) {
  return {
    seasonType: event?.seasonType?.type ?? null,
    seasonName: event?.seasonType?.name ?? null,
    seasonYear: event?.season?.year ?? null,
    week: event?.week?.number ?? null,
    notes: asArray(event?.competitions?.[0]?.notes)
      .map((note) => note?.headline)
      .filter((headline) => typeof headline === "string"),
  };
}

export function labelForGame(teamId, clues) {
  const notes = asArray(clues?.notes);
  if (teamId === "pacers" && notes.some((note) => PLAYIN_NOTE.test(note))) return "Play-in";
  if (teamId === "pacers" && notes.some((note) => CUP_NOTE.test(note))) return "NBA Cup";
  if (teamId === "reds" && SPRING_NAME.test(clues?.seasonName || "")) return "Spring training";
  const labels = SEASON_TYPE_LABELS[teamId];
  if (!labels) return null;
  return labels[Number(clues?.seasonType)] || null;
}

function scoreboardType(scoreboard) {
  const top = scoreboard?.season?.type;
  if (top != null && top !== "") return Number(top);
  const nested = scoreboard?.leagues?.[0]?.season?.type?.type;
  if (nested != null && nested !== "") return Number(nested);
  return null;
}

function scoreboardYear(scoreboard) {
  const year = scoreboard?.season?.year;
  if (year == null || year === "") return null;
  const number = Number(year);
  return Number.isFinite(number) ? number : null;
}

export function onBye({ espnTeamId, byeWeek, events, scoreboard }) {
  const week = scoreboard?.week?.number;
  if (typeof week !== "number") return false;
  if (scoreboardType(scoreboard) !== 2) return false;
  if (asArray(events).some((event) => event?.week?.number === week)) return false;
  const listed = asArray(scoreboard?.week?.teamsOnBye).some((team) => String(team?.id) === String(espnTeamId));
  if (listed) return true;
  return byeWeek != null && Number(byeWeek) === week;
}

function eventForGame(events, game) {
  return asArray(events).find((event) => String(event?.id) === String(game?.id)) || null;
}

function calendarSaysOffseason(scoreboard, now) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  return asArray(scoreboard?.leagues?.[0]?.calendar).some((entry) => {
    const start = new Date(entry?.startDate).getTime();
    const end = new Date(entry?.endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || nowMs < start || nowMs > end) return false;
    return /^off/i.test(String(entry?.label || ""));
  });
}

export function seasonStateForTeam({ id, espnTeamId, byeWeek, events, games, scoreboard, now }) {
  const labelFor = (game) => labelForGame(id, eventClues(eventForGame(events, game)));
  const live = asArray(games).find((game) => game.status === "in");
  if (live) return labelFor(live) || "Offseason";
  const next = pickNext(asArray(games), now);
  const nextDay = next ? easternYmd(next.start) : null;
  const today = easternYmd(now);
  if (next && nextDay && nextDay === today) return labelFor(next) || "Offseason";
  if (id === "colts" && onBye({ espnTeamId, byeWeek, events, scoreboard })) return "Bye";
  if (calendarSaysOffseason(scoreboard, now)) return "Offseason";
  if (!next) return "Offseason";
  const boardYear = scoreboardYear(scoreboard);
  const nextYear = eventClues(eventForGame(events, next)).seasonYear;
  if (boardYear != null && nextYear != null && Number(nextYear) > boardYear) return "Offseason";
  if (boardYear == null) {
    const diff = easternDayDiff(next.start, now);
    if (diff != null && diff > 45) return "Offseason";
  }
  return labelFor(next) || "Offseason";
}

export function seasonStateForUfc(ufc, now) {
  const events = asArray(ufc?.schedule);
  const today = easternYmd(now);
  if (today && events.some((event) => easternYmd(event.start) === today)) return UFC_SEASON_LABEL;
  const next = events.find((event) => event.status === "in")
    || events.find((event) => event.status === "scheduled" || event.status === "postponed");
  if (next?.status === "in") return UFC_SEASON_LABEL;
  const diff = next ? easternDayDiff(next.start, now) : null;
  if (diff != null && diff >= 0 && diff <= FIGHT_WEEK_DAYS) return UFC_SEASON_LABEL;
  return null;
}

export function teamInjuryRows(feed, espnTeamId) {
  if (feed == null) return { loaded: false, rows: [] };
  const block = asArray(feed.injuries).find((item) => String(item?.id) === String(espnTeamId));
  if (!block) return { loaded: true, rows: [] };
  return { loaded: true, rows: asArray(block.injuries) };
}

function injuryStatusText(row) {
  return typeof row?.status === "string" ? row.status.trim() : "";
}

function availabilityReason(row, status) {
  if (status === "Active") return null;
  const type = row?.details?.type;
  if (typeof type !== "string") return null;
  const trimmed = type.trim();
  if (!trimmed || /not specified/i.test(trimmed)) return null;
  return trimmed.slice(0, 40);
}

export function normalizeAvailability(teamId, feed, espnTeamId) {
  const { loaded, rows } = teamInjuryRows(feed, espnTeamId);
  if (!loaded) return [];
  const pins = PINS[teamId] || [];
  const byKey = new Map();
  for (const row of rows) {
    const displayName = row?.athlete?.displayName;
    if (typeof displayName !== "string" || displayName.trim() === "") continue;
    const name = displayName.trim().slice(0, 80);
    const key = pinKey(name);
    const pin = pins.find((item) => pinKey(item.name) === key) || null;
    const mapped = STATUS_RULES.find(([pattern]) => pattern.test(injuryStatusText(row)))?.[1] || null;
    if (!mapped && !pin) continue;
    const status = mapped || "Active";
    const abbreviation = row?.athlete?.position?.abbreviation;
    const next = {
      name,
      position: typeof abbreviation === "string" ? abbreviation.trim().slice(0, 8) : "",
      status,
      reason: availabilityReason(row, status),
    };
    const prev = byKey.get(key);
    if (!prev || STATUS_RANK[status] < STATUS_RANK[prev.status]) byKey.set(key, next);
  }
  for (const pin of pins) {
    const key = pinKey(pin.name);
    if (byKey.has(key)) continue;
    byKey.set(key, { name: pin.name, position: pin.position, status: "Active", reason: null });
  }
  return [...byKey.values()].sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    return pinKey(a.name).localeCompare(pinKey(b.name));
  });
}

function competitorStatusName(competitor) {
  const status = competitor?.status;
  if (typeof status === "string") return status;
  return status?.type?.name || "";
}

export function fightNote(comp, status) {
  const pulled = asArray(comp?.competitors)
    .filter((competitor) => /PULL|WITHDRAW/.test(competitorStatusName(competitor)))
    .map((competitor) => competitor?.athlete?.displayName || competitor?.athlete?.fullName)
    .filter((name) => typeof name === "string" && name.trim() !== "");
  if (pulled.length) return `${pulled.join(", ")} pulled`.slice(0, 80);
  if (status?.status !== "canceled") return null;
  const text = String(comp?.status?.type?.shortDetail || comp?.status?.type?.detail || "").trim();
  if (text && !/^cancell?ed$/i.test(text)) return text.slice(0, 80);
  return "Canceled";
}

export function assertSnapshot(snapshot) {
  const problems = [];
  if (!snapshot || snapshot.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  const teams = asArray(snapshot?.teams);
  for (const id of ["colts", "pacers", "reds"]) {
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
