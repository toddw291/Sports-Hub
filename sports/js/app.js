import { buildLiveSnapshot, snapshotProblems } from "./api.js";
import { STATUS_RANK, easternYmd } from "./normalize.js";

const TEAM_ORDER = ["colts", "pacers", "reds", "ufc"];
const STORAGE_KEY = "ward-sports-snapshot-v1";
const HINT_KEY = "ward-sports-install-hint";
const ET = "America/New_York";

const state = {
  snapshot: null,
  source: "loading",
  teamId: "colts",
  error: "",
  loading: false,
};

const mainEl = document.querySelector("#main");
const teamsEl = document.querySelector("#teams");
const sectionsEl = document.querySelector("#sections");
const statusEl = document.querySelector("#status");
const updatedEl = document.querySelector("#updated");
const refreshBtn = document.querySelector("#refresh");
const installEl = document.querySelector("#install-hint");
const dismissBtn = document.querySelector("#dismiss-hint");

refreshBtn.addEventListener("click", () => refresh({ manual: true }));
dismissBtn.addEventListener("click", () => {
  installEl.hidden = true;
  try { localStorage.setItem(HINT_KEY, "1"); } catch { /* private mode */ }
});

registerWorker();
init();

async function init() {
  const saved = loadStored() || await loadFile();
  if (saved) {
    state.snapshot = saved;
    state.source = "saved";
    state.teamId = initialTeam(saved);
    paint();
  }
  await refresh({ manual: false });
  maybeShowInstallHint();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh({ manual: false });
  });
  scheduleLiveTick();
}

function initialTeam(snapshot) {
  const hash = location.hash.replace("#", "");
  if (isTeam(hash, snapshot)) return hash;
  try {
    const stored = sessionStorage.getItem("ward-team");
    if (isTeam(stored, snapshot)) return stored;
  } catch { /* ignore */ }
  return "colts";
}

function isTeam(id, snapshot) {
  if (!id || !snapshot) return false;
  if (id === "ufc") return Boolean(snapshot.ufc);
  return (snapshot.teams || []).some((team) => team.id === id);
}

async function refresh({ manual }) {
  if (state.loading) return;
  state.loading = true;
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Hailing";
  try {
    const live = await buildLiveSnapshot();
    state.snapshot = live;
    state.source = "live";
    state.error = "";
    store(live);
    if (!isTeam(state.teamId, live)) state.teamId = "colts";
  } catch (error) {
    if (!state.snapshot) {
      state.error = "The live score feed did not answer, and there is no saved copy on this phone yet.";
    } else if (manual) {
      state.error = "ESPN did not answer. Showing the last saved copy.";
    }
    console.warn(error);
  } finally {
    state.loading = false;
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Commune";
    paint({ keepScroll: true });
    scheduleLiveTick();
  }
}

let liveTimer = 0;
function scheduleLiveTick() {
  clearInterval(liveTimer);
  if (!state.snapshot || !hasLive(state.snapshot)) return;
  liveTimer = setInterval(() => {
    if (document.visibilityState === "visible") refresh({ manual: false });
  }, 30000);
}

function hasLive(snapshot) {
  for (const team of snapshot.teams || []) {
    if ((team.schedule || []).some((game) => game.status === "in")) return true;
  }
  const events = snapshot.ufc?.schedule || [];
  return events.some((event) => event.status === "in" || (event.fights || []).some((fight) => fight.status === "in"));
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return snapshotProblems(parsed).length ? null : parsed;
  } catch {
    return null;
  }
}

async function loadFile() {
  try {
    const response = await fetch("./data/snapshot.json", { cache: "no-cache" });
    if (!response.ok) return null;
    const parsed = await response.json();
    return snapshotProblems(parsed).length ? null : parsed;
  } catch {
    return null;
  }
}

function store(snapshot) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* quota */ }
}

function paint({ keepScroll = false } = {}) {
  const open = keepScroll
    ? [...document.querySelectorAll("details[open]")].map((node) => node.dataset.key)
    : [];
  const y = keepScroll ? window.scrollY : 0;
  const snapshot = state.snapshot;
  document.documentElement.dataset.team = state.teamId || "colts";
  renderStatus();
  if (!snapshot) {
    teamsEl.replaceChildren();
    sectionsEl.replaceChildren();
    const waiting = !state.error;
    mainEl.replaceChildren(el("p", {
      class: waiting ? "empty candle" : "banner",
      text: state.error || "Consulting the Codex…",
    }));
    return;
  }
  renderTeams(snapshot);
  if (state.teamId === "ufc") renderUfc(snapshot.ufc);
  else renderClub(snapshot.teams.find((team) => team.id === state.teamId) || snapshot.teams[0]);
  document.title = titleFor(state.teamId, snapshot);
  if (location.hash.replace("#", "") !== state.teamId) {
    history.replaceState(null, "", `#${state.teamId}`);
  }
  for (const key of open) {
    const node = [...mainEl.querySelectorAll("details")].find((item) => item.dataset.key === key);
    if (node) node.open = true;
  }
  if (keepScroll) window.scrollTo(0, y);
}

function titleFor(id, snapshot) {
  if (id === "ufc") return "UFC · Ward Sports";
  const team = snapshot.teams.find((item) => item.id === id);
  return team ? `${team.shortName} · Ward Sports` : "Ward Sports";
}

function renderStatus() {
  const when = state.snapshot ? formatUpdated(state.snapshot.updatedAt) : "";
  if (state.source === "live") {
    updatedEl.textContent = when ? `Live · ${when}` : "Live from ESPN";
  } else if (state.source === "saved") {
    updatedEl.textContent = when ? `Saved · ${when}` : "Saved copy";
  } else {
    updatedEl.textContent = "";
  }
  statusEl.replaceChildren();
  if (!state.error) return;
  statusEl.append(el("p", { class: "banner", role: "status", text: state.error }));
}

function renderTeams(snapshot) {
  const buttons = TEAM_ORDER.map((id) => {
    const active = id === state.teamId;
    const label = id === "ufc" ? "UFC" : snapshot.teams.find((team) => team.id === id)?.shortName || id;
    const league = id === "ufc" ? "Cards" : snapshot.teams.find((team) => team.id === id)?.league || "";
    const abbr = id === "ufc" ? "UFC" : snapshot.teams.find((team) => team.id === id)?.abbr || label.slice(0, 3).toUpperCase();
    return el("button", {
      type: "button",
      class: `team-btn team-${id}${active ? " is-active" : ""}`,
      "aria-pressed": active ? "true" : "false",
      onClick: () => selectTeam(id),
    }, [
      el("span", { class: "shield", "aria-hidden": "true", text: abbr }),
      el("span", { class: "team-copy" }, [
        el("span", { class: "team-name", text: label }),
        el("span", { class: "team-league", text: league }),
      ]),
    ]);
  });
  teamsEl.replaceChildren(...buttons);
}

function selectTeam(id) {
  state.teamId = id;
  try { sessionStorage.setItem("ward-team", id); } catch { /* ignore */ }
  history.replaceState(null, "", `#${id}`);
  paint({ keepScroll: false });
  window.scrollTo(0, 0);
}

function renderClub(team) {
  if (!team) {
    mainEl.replaceChildren(el("p", { class: "banner", text: "That team is not in the saved data." }));
    sectionsEl.replaceChildren();
    return;
  }
  renderSectionNav([
    ["next", "Next"],
    ["recent", "Reports"],
    ["schedule", "Log"],
    ["standings", "Rankings"],
  ]);
  const upcoming = team.schedule.filter((game) => game.status === "scheduled" || game.status === "postponed" || game.status === "in");
  const played = team.schedule.filter((game) => game.status === "final");
  const cap = team.league === "NFL" ? upcoming.length : 8;
  mainEl.replaceChildren(
    section("next", "Next Engagement", "The next game.", nextCard(team)),
    section("recent", "After-Action Reports", "The latest final scores.", team.recent.length
      ? el("div", { class: "stack" }, team.recent.map((game) => gameRow(game, team)))
      : empty("No final scores yet.")),
    section("schedule", "Campaign Log", "The rest of the calendar.", [
      team.byeWeek ? el("p", { class: "note", text: `Bye week ${team.byeWeek}` }) : null,
      upcoming.length
        ? el("div", { class: "stack" }, upcoming.slice(0, cap).map((game) => gameRow(game, team)))
        : empty("No upcoming game on the schedule."),
      upcoming.length > cap
        ? details(`upcoming-${team.id}`, `Rest of the schedule (${upcoming.length - cap})`, upcoming.slice(cap).map((game) => gameRow(game, team)))
        : null,
      played.length
        ? details(`played-${team.id}`, `Played games (${played.length})`, played.slice().reverse().map((game) => gameRow(game, team)))
        : null,
    ]),
    section("standings", "Sector Rankings", team.standingName || "Division table.", standingsTable(team)),
  );
}

function renderUfc(ufc) {
  renderSectionNav([
    ["next", "Next"],
    ["recent", "Reports"],
    ["schedule", "Log"],
  ]);
  if (!ufc) {
    mainEl.replaceChildren(el("p", { class: "banner", text: "UFC data is not in this copy." }));
    return;
  }
  mainEl.replaceChildren(
    section("next", "Arena of Champions", "The next card.", ufc.nextEvent ? eventCard(ufc.nextEvent, { featured: true, seasonState: ufc.seasonState }) : empty("No upcoming UFC card in this window.")),
    section("recent", "After-Action Reports", "Finished cards.", ufc.recent.length
      ? el("div", { class: "stack" }, ufc.recent.map((event) => eventCard(event, { featured: false })))
      : empty("No recent UFC cards in this window.")),
    section("schedule", "Campaign Log", "Cards in this window.", ufc.schedule.length
      ? el("div", { class: "stack" }, ufc.schedule.map((event) => eventLine(event)))
      : empty("No UFC events in this window.")),
  );
}

function renderSectionNav(items) {
  sectionsEl.replaceChildren(...items.map(([id, label]) => el("button", {
    type: "button",
    class: "section-link",
    onClick: () => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  }, [label])));
}

function nextCard(team) {
  const game = team.nextGame;
  if (!game) return empty("No upcoming game on the schedule.");
  const when = formatKickoff(game.start, game.timeValid);
  const place = game.ours === "home" ? "Home" : game.ours === "away" ? "Away" : game.neutralSite ? "Neutral" : "";
  const card = el("article", {
    class: `battle-card is-${game.status}${typeof game.phase === "string" ? " is-gameday" : ""}`,
  }, [
    el("p", { class: "identity" }, [
      logo(team.logo, team.name, 36, team.abbr),
      el("span", {}, [
        el("span", { class: "identity-name", text: team.name }),
        typeof team.seasonState === "string" && team.seasonState
          ? el("span", { class: "season-badge", text: team.seasonState })
          : null,
        el("span", { class: "identity-meta", text: [team.record, team.standingName, team.seed ? `Seed ${team.seed}` : "", team.streak].filter(Boolean).join(" · ") }),
      ]),
    ]),
    el("p", { class: "when" }, [
      el("span", { class: "wax", text: when.date }),
      el("span", { class: "when-time", text: game.timeValid ? `${when.time} ${when.zone}` : "Time TBD" }),
    ]),
    el("div", { class: "scoreboard" }, [sideRow(game.away, game, "away"), sideRow(game.home, game, "home")]),
    el("p", { class: "meta" }, [
      game.status === "in" ? el("span", { class: "live-pill", "aria-label": "LIVE", text: "In Battle" }) : null,
      el("span", { text: statusLine(game) }),
    ]),
    el("p", { class: "meta dim", text: [place, game.venue, game.broadcast].filter(Boolean).join(" · ") }),
  ]);
  const rows = Array.isArray(team.availability) ? team.availability : [];
  if (!rows.length) return card;
  return [card, availabilityList(game, rows)];
}

function availabilityList(game, rows) {
  const gameDay = easternYmd(game.start) != null && easternYmd(game.start) === easternYmd(new Date());
  const outs = gameDay && rows.some((row) => STATUS_RANK[row.status] <= STATUS_RANK.Suspended);
  return el("div", { class: "availability" }, [
    outs ? el("p", { class: "note", text: "Out today" }) : null,
    ...rows.map(availabilityRow),
  ]);
}

function availabilityRow(row) {
  const who = [row.name, row.position].filter((part) => part);
  const state = [row.status, row.reason].filter((part) => part);
  return el("div", { class: "availability-row", "data-status": row.status }, [
    el("span", { text: who.join(" ") }),
    el("span", { class: "avail-status", text: state.join(" · ") }),
  ]);
}

function sideRow(side, game, which) {
  const ours = game.ours === which;
  return el("div", { class: `side${ours ? " is-ours" : ""}` }, [
    logo(side.logo, side.name, 44, side.abbr),
    el("span", { class: "side-name" }, [
      el("span", { class: "abbr", text: side.abbr || side.shortName }),
      el("span", { class: "full", text: side.name }),
    ]),
    el("span", { class: `score ${scoreClass(game, side)}`, text: displayScore(game, side) }),
  ]);
}

function gameRow(game, team) {
  const when = formatKickoff(game.start, game.timeValid);
  const upcoming = game.status === "scheduled" || game.status === "postponed";
  return el("article", { class: `game-row is-${game.status}${game.id === team.nextGame?.id ? " is-next" : ""}` }, [
    el("div", { class: "when-col" }, [
      el("span", { class: "row-date", text: when.date }),
      el("span", { class: "row-sub", text: upcoming ? (game.timeValid ? `${when.time} ${when.zone}` : "Time TBD") : statusLabel(game.status) }),
    ]),
    el("div", { class: "matchup" }, [
      miniSide(game.away, game),
      el("span", { class: "at", text: game.neutralSite ? "vs" : "@" }),
      miniSide(game.home, game),
    ]),
    el("div", { class: "row-score", "aria-label": scoreLabel(game) }, upcoming && game.status !== "in"
      ? [el("span", { class: "row-time", text: game.timeValid ? when.time : "TBD" })]
      : [scoreBit(game, game.away), scoreBit(game, game.home)]),
  ]);
}

function miniSide(side, game) {
  const ours = (game.ours === "home" && side === game.home) || (game.ours === "away" && side === game.away);
  return el("span", { class: `mini${ours ? " is-ours" : ""}` }, [
    logo(side.logo, side.abbr, 28, side.abbr),
    el("span", { text: side.abbr }),
  ]);
}

function scoreBit(game, side) {
  return el("span", { class: `score ${scoreClass(game, side)}`, text: displayScore(game, side) });
}

function standingsTable(team) {
  if (!team.standings.length) return empty("Standings are not on the feed right now.");
  const showTies = team.standings.some((row) => row.ties);
  return el("div", { class: "table-wrap" }, [
    el("table", {}, [
      el("thead", {}, el("tr", {}, [
        el("th", { scope: "col", text: "Team" }),
        el("th", { scope: "col", text: showTies ? "W-L-T" : "W-L" }),
        el("th", { scope: "col", text: "Strk" }),
        el("th", { scope: "col", text: "Seed" }),
      ])),
      el("tbody", {}, team.standings.map((row) => el("tr", { class: row.ours ? "is-ours" : "" }, [
        el("th", { scope: "row" }, [
          logo(row.logo, row.name, 24, row.abbr),
          el("span", { text: row.name || row.abbr }),
        ]),
        el("td", { text: formatRecord(row) }),
        el("td", { text: row.streak || "—" }),
        el("td", { text: row.seed || "—" }),
      ]))),
    ]),
  ]);
}

function eventCard(event, { featured, seasonState }) {
  const when = formatKickoff(event.start, event.timeValid);
  const fights = event.fights || [];
  const main = fights.filter((fight) => fight.card === "main" && !fight.mainEvent);
  const prelims = fights.filter((fight) => fight.card !== "main");
  const mainEvent = fights.find((fight) => fight.mainEvent);
  const lead = [mainEvent, ...(featured ? main : [])].filter(Boolean);
  return el("article", { class: `battle-card is-${event.status}` }, [
    featured ? el("p", { class: "kicker" }, [
      event.shortName || "UFC",
      seasonState === "Fight week" ? el("span", { class: "season-badge", text: "Fight week" }) : null,
    ]) : null,
    el("h3", { class: "event-name", text: event.name }),
    featured
      ? el("p", { class: "when" }, [
        el("span", { class: "wax", text: when.date }),
        el("span", { class: "when-time", text: event.timeValid ? `${when.time} ${when.zone}` : "Time TBD" }),
      ])
      : el("p", { class: "when", text: [when.date, event.timeValid ? `${when.time} ${when.zone}` : "Time TBD"].join(" · ") }),
    el("p", { class: "meta" }, [
      event.status === "in" ? el("span", { class: "live-pill", "aria-label": "LIVE", text: "In Battle" }) : null,
      el("span", { class: "dim", text: [event.status === "in" ? "" : statusLabel(event.status), event.venue, event.broadcast].filter(Boolean).join(" · ") }),
    ]),
    lead.length ? el("div", { class: "fights" }, withSkulls(lead.map((fight) => fightRow(fight)))) : null,
    featured && prelims.length
      ? details(`prelim-${event.id}`, `Prelims (${prelims.length})`, withSkulls(prelims.map((fight) => fightRow(fight))))
      : null,
    !featured && fights.length > 1
      ? details(`card-${event.id}`, `Full card (${fights.length})`, withSkulls(fights.map((fight) => fightRow(fight))))
      : null,
    fights.length ? null : empty("Card not posted yet."),
  ]);
}

function eventLine(event) {
  const when = formatKickoff(event.start, event.timeValid);
  return el("article", { class: `game-row is-event is-${event.status}` }, [
    el("div", { class: "when-col" }, [
      el("span", { class: "row-date", text: when.date }),
      el("span", { class: "row-sub", text: event.timeValid ? `${when.time} ${when.zone}` : "Time TBD" }),
    ]),
    el("div", { class: "event-line" }, [
      el("span", { class: "event-title", text: event.name }),
      el("span", { class: "row-sub", text: [statusLabel(event.status), event.venue].filter(Boolean).join(" · ") }),
    ]),
  ]);
}

function fightRow(fight) {
  const classes = [`fight is-${fight.status}`];
  if (fight.mainEvent) classes.push("is-main");
  if (fight.status === "canceled") classes.push("is-canceled");
  if (typeof fight.note === "string") classes.push("is-pulled");
  return el("div", { class: classes.join(" ") }, [
    el("div", { class: "fight-head" }, [
      el("span", { class: "weight", text: fight.weightClass || "Bout" }),
      el("span", { class: "method", text: methodLine(fight) }),
    ]),
    el("div", { class: "fighters" }, (fight.fighters || []).map((fighter) => el("div", { class: `fighter${fighter.winner ? " is-winner" : ""}` }, [
      fighter.flag ? logo(fighter.flag, fighter.country || "", 22) : null,
      el("span", { class: "fighter-name", text: fighter.name }),
      fighter.record ? el("span", { class: "record", text: fighter.record }) : null,
      fighter.winner ? el("span", { class: "win-mark", "aria-label": "Winner" }, [laurel(), el("span", { class: "win-letter", text: "W" })]) : null,
    ]))),
  ]);
}

function methodLine(fight) {
  if (typeof fight.note === "string") return fight.note;
  if (fight.status === "canceled") return "Canceled";
  if (fight.status === "postponed") return "Postponed";
  if (fight.status === "in") return fight.detail || "Live";
  if (fight.status === "final") {
    if (fight.method && fight.finish) return `${fight.method} · ${fight.finish}`;
    return fight.method || "Final";
  }
  return "Scheduled";
}

function section(id, title, subtitle, content) {
  return el("section", { id, class: "block" }, [
    el("div", { class: "section-head" }, [
      el("h2", {}, [ruleIcon(), el("span", { text: title }), ruleIcon()]),
      subtitle ? el("p", { class: "section-sub", text: subtitle }) : null,
    ]),
    ...(Array.isArray(content) ? content : [content]),
  ]);
}

function details(key, label, nodes) {
  return el("details", { "data-key": key }, [
    el("summary", { text: label }),
    el("div", { class: "stack" }, nodes),
  ]);
}

function empty(text) {
  return el("p", { class: "empty", text });
}

function logo(src, alt, size, abbr) {
  const fallback = () => el("span", {
    class: "shield shield-plain",
    style: `width:${size}px;height:${Math.round(size * 1.15)}px`,
    "aria-hidden": "true",
    text: (abbr || "").slice(0, 3).toUpperCase(),
  });
  if (!src) return fallback();
  const img = el("img", { class: "logo", src, alt, width: String(size), height: String(size) });
  img.addEventListener("error", () => img.replaceWith(fallback()));
  return img;
}

function withSkulls(rows) {
  const nodes = [];
  for (const row of rows) {
    if (!row) continue;
    if (nodes.length) nodes.push(el("div", { class: "skull-rule", "aria-hidden": "true" }, [skull()]));
    nodes.push(row);
  }
  return nodes;
}

function svgEl(viewBox, className, markup) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("viewBox", viewBox);
  node.setAttribute("class", className);
  node.setAttribute("aria-hidden", "true");
  node.innerHTML = markup;
  return node;
}

function ruleIcon() {
  return svgEl("0 0 32 16", "rule-icon", `<path fill="currentColor" d="M16 9 11 5 5 7l5 2-5 2 6-1 3 3zM16 9l5-4 6 2-5 2 5 2-6-1-3 3zM14.2 4.2 16 2l1.8 2.2L17 11l-1 2-1-2z"/>`);
}

function skull() {
  return svgEl("0 0 24 16", "skull", `<path fill="currentColor" d="M12 1.2c3 0 5.2 2 5.2 4.8 0 1.5-.6 2.6-1.4 3.3V12H8.2V9.3C7.4 8.6 6.8 7.5 6.8 6 6.8 3.2 9 1.2 12 1.2zM9.4 5.2a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm5.2 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zM9.6 10.6h1.2V13H9.6zm2 0H13v2.4h-1.4zm2.2 0h1.2V13h-1.2z"/>`);
}

function laurel() {
  return svgEl("0 0 36 28", "laurel", `
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M12 24c-1.2-5.2.4-10.2 4.6-14.2"/>
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M24 24c1.2-5.2-.4-10.2-4.6-14.2"/>
    <path fill="currentColor" d="M11.2 20.2 7.4 19l2.6-2.2 1.2 3.4zm.6-4.2L8.6 14.6l3.2-1 .8 3.4zm1.2-4.1-2.6-2.2 3.4-.4.2 2.6zM24.8 20.2 28.6 19l-2.6-2.2-1.2 3.4zm-.6-4.2 3.2-1.4-3.2-1-.8 2.4zm-1.2-4.1 2.6-2.2-3.4-.4-.2 2.6z"/>
  `);
}

function displayScore(game, side) {
  if (side.score != null) return side.score;
  return "–";
}

function scoreClass(game, side) {
  if (game.status !== "final") return "";
  if (side.winner) return "is-win";
  const other = side === game.home ? game.away : game.home;
  if (other?.winner) return "is-loss";
  return "";
}

function scoreLabel(game) {
  return `${game.away.abbr} ${game.away.score ?? ""} ${game.home.abbr} ${game.home.score ?? ""}`.trim();
}

function statusLine(game) {
  if (typeof game.phase === "string") return phaseLine(game);
  if (game.status === "in") return game.detail || "In progress";
  if (game.status === "final") return "Final";
  if (game.status === "postponed") return "Postponed";
  if (game.status === "canceled") return "Canceled";
  return "Upcoming";
}

function phaseLine(game) {
  if (game.phase === "In progress") return game.detail || "In progress";
  if (game.phase === "Overtime" || game.phase === "End of period" || game.phase === "Halftime") {
    const detail = game.detail || "";
    if (detail && !detail.toLowerCase().includes(game.phase.toLowerCase())) return `${game.phase} · ${detail}`;
    return game.phase;
  }
  return game.phase;
}

function statusLabel(status) {
  if (status === "in") return "Live";
  if (status === "final") return "Final";
  if (status === "postponed") return "Postponed";
  if (status === "canceled") return "Canceled";
  return "Upcoming";
}

function formatRecord(row) {
  if (row.wins == null || row.losses == null) return "—";
  if (row.ties) return `${row.wins}-${row.losses}-${row.ties}`;
  return `${row.wins}-${row.losses}`;
}

function formatKickoff(iso, timeValid) {
  if (!iso) return { date: "Date TBD", time: "", zone: "ET" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { date: "Date TBD", time: "", zone: "ET" };
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, weekday: "short", month: "short", day: "numeric",
  }).format(date);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: ET, timeZoneName: "short" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value || "ET";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: ET, hour: "numeric", minute: "2-digit",
  }).format(date);
  return { date: day, time: timeValid === false ? "Time TBD" : time, zone };
}

function formatUpdated(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const dayKey = (value) => new Intl.DateTimeFormat("en-US", {
    timeZone: ET, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
  const sameDay = dayKey(date) === dayKey(new Date());
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(sameDay ? {} : { month: "short", day: "numeric" }),
  }).format(date);
}

function maybeShowInstallHint() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let dismissed = false;
  try { dismissed = localStorage.getItem(HINT_KEY) === "1"; } catch { /* ignore */ }
  installEl.hidden = standalone || dismissed;
}

function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  const start = () => navigator.serviceWorker.register("./sw.js").catch(() => {});
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}
