"use strict";

const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require("tiktok-live-connector");

const config = {
  slug: clean(process.env.CREATOR_SLUG) || "mosyaamosya",
  creatorId: clean(process.env.CREATOR_ID) || "11111111-1111-4111-8111-111111111111",
  username: normalizeUsername(process.env.CREATOR_LIVE_USERNAME || process.env.TIKTOK_LIVE_USERNAME || "mosyaamosya"),
  supabaseUrl: clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
  serviceRoleKey: clean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  staleSeconds: positiveInteger(process.env.RUNTIME_STALE_SECONDS, 75),
  heartbeatSeconds: positiveInteger(process.env.RUNTIME_HEARTBEAT_SECONDS, 25),
  reconnectMinMs: positiveInteger(process.env.RUNTIME_RECONNECT_MIN_MS, 10_000),
  reconnectMaxMs: positiveInteger(process.env.RUNTIME_RECONNECT_MAX_MS, 300_000),
  signApiKey: clean(process.env.TIKTOK_SIGN_API_KEY),
  sessionCookie: clean(process.env.TIKTOK_SESSION_COOKIE)
};

if (!config.supabaseUrl || !config.serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const state = createEmptyState();
let connection = null;
let reconnectAttempt = 0;
let heartbeatTimer = null;
let stopped = false;
let activeBattleId = "";

function log(message, details = {}) {
  const suffix = Object.keys(details).length ? " " + JSON.stringify(details) : "";
  console.log(new Date().toISOString() + " " + message + suffix);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : fallback;
}

function normalizeUsername(value) {
  return clean(value || "mosyaamosya").replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "") || "mosyaamosya";
}

function iso(value = Date.now()) {
  return new Date(value).toISOString();
}

function createEmptyState() {
  return {
    isLive: false,
    confirmed: false,
    confidence: "unknown",
    source: "runtime",
    viewerCount: null,
    likeCount: null,
    liveDuration: null,
    liveStartedAt: null,
    roomId: null,
    liveTitle: null,
    battleActive: false,
    battleOpponent: null,
    battleResult: null,
    battleWinStreak: null,
    battleUpdatedAt: null,
    gifts: [],
    topGifters: [],
    rankings: [],
    checkedAt: iso(),
    lastEventAt: null,
    stale: true,
    error: null,
    capabilities: {
      viewerCount: false,
      likeCount: false,
      liveDuration: false,
      roomId: false,
      liveTitle: false,
      battleActive: false,
      battleWinStreak: false,
      battleResult: false,
      gifts: false,
      topGifters: false,
      rankings: false
    }
  };
}

function numberOrNull(...values) {
  for (const value of values) {
    const next = Number(value);
    if (Number.isFinite(next) && next >= 0) return next;
  }
  return null;
}

function stringOrNull(...values) {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return null;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function markEvent() {
  state.checkedAt = iso();
  state.lastEventAt = iso();
  state.stale = false;
  state.error = null;
}

function setLive(roomState = {}) {
  state.isLive = true;
  state.confirmed = true;
  state.confidence = "confirmed";
  state.source = "runtime";
  state.stale = false;
  state.error = null;
  state.checkedAt = iso();
  state.lastEventAt = iso();
  state.roomId = stringOrNull(roomState.roomId, roomState.room_id, connection && connection.roomId, state.roomId);
  state.capabilities.roomId = Boolean(state.roomId);
  const roomInfo = roomState.roomInfo || roomState.room_info || (connection && connection.roomInfo) || {};
  applyRoomInfo(roomInfo);
}

function setOffline(error = null) {
  state.isLive = false;
  state.confirmed = !error;
  state.confidence = error ? "unknown" : "confirmed";
  state.stale = false;
  state.error = error;
  state.checkedAt = iso();
  state.lastEventAt = iso();
  state.battleActive = false;
  state.capabilities.battleActive = true;
}

function markStale(error) {
  state.isLive = false;
  state.confirmed = false;
  state.confidence = "unknown";
  state.stale = true;
  state.error = error || "RUNTIME_DISCONNECTED";
  state.checkedAt = iso();
}

function markDisconnected() {
  state.checkedAt = iso();
  state.lastEventAt = state.lastEventAt || iso();
  state.error = "RUNTIME_DISCONNECTED";
  if (state.isLive && state.roomId) {
    state.confirmed = true;
    state.confidence = "confirmed";
    state.stale = false;
    return;
  }
  markStale("RUNTIME_DISCONNECTED");
}

function applyRoomInfo(roomInfo = {}) {
  const title = stringOrNull(roomInfo.title, roomInfo.liveTitle, roomInfo.live_title, roomInfo.room_title);
  if (title) {
    state.liveTitle = title;
    state.capabilities.liveTitle = true;
  }
  const started = numberOrNull(roomInfo.create_time, roomInfo.createTime, roomInfo.start_time, roomInfo.startTime, roomInfo.live_start_time, roomInfo.liveStartTime);
  if (started) {
    state.liveStartedAt = iso(started > 10_000_000_000 ? started : started * 1000);
    updateDuration();
  }
}

function updateDuration() {
  if (!state.liveStartedAt) return;
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(state.liveStartedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  state.liveDuration = hours > 0 ? hours + "h " + String(minutes).padStart(2, "0") + "m" : minutes + "m";
  state.capabilities.liveDuration = true;
}

function applyRoomUser(data = {}) {
  const count = numberOrNull(data.viewerCount, data.totalUser, data.total_user, data.total, data.userCount, data.user_count);
  if (count !== null) {
    state.viewerCount = count;
    state.capabilities.viewerCount = true;
  }

  const ranks = arrayOrEmpty(data.ranksList).length ? data.ranksList : arrayOrEmpty(data.ranks);
  if (ranks.length) {
    state.topGifters = ranks.slice(0, 10).map((rank) => ({
      username: stringOrNull(rank.user && rank.user.uniqueId, rank.user && rank.user.displayId, rank.user && rank.user.nickname),
      nickname: stringOrNull(rank.user && rank.user.nickname, rank.user && rank.user.displayName),
      coinCount: numberOrNull(rank.coinCount, rank.coin_count, rank.score)
    })).filter((rank) => rank.username || rank.nickname);
    state.capabilities.topGifters = state.topGifters.length > 0;
  }
}

function applyLike(data = {}) {
  const total = numberOrNull(data.totalLikeCount, data.total_like_count, data.total);
  if (total !== null) {
    state.likeCount = total;
    state.capabilities.likeCount = true;
  }
}

function applyGift(data = {}) {
  const gift = {
    username: stringOrNull(data.user && data.user.uniqueId, data.user && data.user.displayId, data.user && data.user.nickname),
    nickname: stringOrNull(data.user && data.user.nickname, data.user && data.user.displayName),
    giftId: stringOrNull(data.giftId, data.gift_id, data.gift && data.gift.id),
    giftName: stringOrNull(data.giftName, data.gift_name, data.giftDetails && data.giftDetails.giftName, data.gift && data.gift.name),
    repeatCount: numberOrNull(data.repeatCount, data.repeat_count) || 1,
    repeatEnd: Boolean(data.repeatEnd ?? data.repeat_end),
    receivedAt: iso()
  };
  state.gifts = [gift, ...state.gifts].slice(0, 25);
  state.capabilities.gifts = true;
}

function findOpponent(data = {}) {
  const anchors = arrayOrEmpty(data.anchorsInfo).length ? data.anchorsInfo : arrayOrEmpty(data.anchors_info);
  const names = anchors.map((entry) => stringOrNull(
    entry.user && entry.user.displayId,
    entry.user && entry.user.uniqueId,
    entry.user && entry.user.nickName,
    entry.user && entry.user.nickname,
    entry.displayId,
    entry.nickName,
    entry.nickname
  )).filter(Boolean);
  const opponent = names.find((name) => normalizeUsername(name) !== config.username);
  return opponent || names[0] || null;
}

function applyBattle(data = {}) {
  activeBattleId = stringOrNull(data.battleId, data.battle_id, activeBattleId) || activeBattleId;
  state.battleActive = true;
  state.battleOpponent = findOpponent(data) || state.battleOpponent;
  state.battleUpdatedAt = iso();
  state.capabilities.battleActive = true;
}

function applyBattleArmies(data = {}) {
  applyBattle(data);
}

function applyRankUpdate(data = {}) {
  const updates = arrayOrEmpty(data.updates);
  if (!updates.length) return;
  state.rankings = updates.slice(0, 10);
  state.capabilities.rankings = true;
}

async function writeSnapshot(reason = "event") {
  updateDuration();
  const now = iso();
  const payload = {
    creator_slug: config.slug,
    creator_id: config.creatorId,
    platform: "tiktok",
    username: config.username,
    is_live: state.isLive,
    confirmed: state.confirmed,
    confidence: state.confidence,
    source: "runtime",
    viewer_count: state.capabilities.viewerCount ? state.viewerCount : null,
    like_count: state.capabilities.likeCount ? state.likeCount : null,
    live_duration: state.capabilities.liveDuration ? state.liveDuration : null,
    live_started_at: state.liveStartedAt,
    room_id: state.capabilities.roomId ? state.roomId : null,
    live_title: state.capabilities.liveTitle ? state.liveTitle : null,
    battle_active: state.capabilities.battleActive ? state.battleActive : false,
    battle_opponent: state.capabilities.battleActive ? state.battleOpponent : null,
    battle_result: null,
    battle_win_streak: null,
    battle_updated_at: state.battleUpdatedAt,
    gifts: state.capabilities.gifts ? state.gifts : [],
    top_gifters: state.capabilities.topGifters ? state.topGifters : [],
    rankings: state.capabilities.rankings ? state.rankings : [],
    live_url: "https://www.tiktok.com/@" + config.username + "/live",
    checked_at: state.checkedAt || now,
    last_event_at: state.lastEventAt,
    stale: state.stale,
    stale_after: new Date(Date.now() + config.staleSeconds * 1000).toISOString(),
    error: state.error,
    capabilities: state.capabilities,
    updated_at: now
  };

  const response = await fetch(config.supabaseUrl + "/rest/v1/creator_live_runtime?on_conflict=creator_slug", {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: "Bearer " + config.serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("Supabase runtime write failed after " + reason + ": " + response.status + " " + text);
  }
}

function attachHandlers(nextConnection) {
  nextConnection.on(ControlEvent.CONNECTED, async (connectedState) => {
    reconnectAttempt = 0;
    setLive(connectedState || {});
    log("connected", { roomId: state.roomId, hasRoomInfo: Boolean(connectedState && connectedState.roomInfo) });
    await safeWrite("connected");
  });

  nextConnection.on(ControlEvent.DISCONNECTED, async () => {
    markDisconnected();
    log("disconnected");
    await safeWrite("disconnected");
    scheduleReconnect();
  });

  nextConnection.on(WebcastEvent.STREAM_END, async () => {
    setOffline(null);
    log("stream_end");
    await safeWrite("streamEnd");
    scheduleReconnect();
  });

  nextConnection.on(WebcastEvent.ROOM_USER, async (data) => {
    markEvent();
    applyRoomUser(data);
    await safeWrite("roomUser");
  });

  nextConnection.on(WebcastEvent.LIKE, async (data) => {
    markEvent();
    applyLike(data);
    await safeWrite("like");
  });

  nextConnection.on(WebcastEvent.GIFT, async (data) => {
    markEvent();
    applyGift(data);
    await safeWrite("gift");
  });

  nextConnection.on(WebcastEvent.LINK_MIC_BATTLE, async (data) => {
    markEvent();
    applyBattle(data);
    await safeWrite("linkMicBattle");
  });

  nextConnection.on(WebcastEvent.LINK_MIC_ARMIES, async (data) => {
    markEvent();
    applyBattleArmies(data);
    await safeWrite("linkMicArmies");
  });

  nextConnection.on(WebcastEvent.LINK_MIC_BATTLE_PUNISH_FINISH, async (data) => {
    if (!activeBattleId || String(data.battleId || data.battle_id || "") === String(activeBattleId)) {
      markEvent();
      state.battleActive = false;
      state.battleUpdatedAt = iso();
      state.capabilities.battleActive = true;
      await safeWrite("linkMicBattlePunishFinish");
    }
  });

  nextConnection.on(WebcastEvent.RANK_UPDATE, async (data) => {
    markEvent();
    applyRankUpdate(data);
    await safeWrite("rankUpdate");
  });
}

async function safeWrite(reason) {
  try {
    await writeSnapshot(reason);
  } catch (error) {
    console.error(error.message || error);
  }
}

function scheduleHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (state.isLive) {
      state.checkedAt = iso();
      safeWrite("heartbeat");
    }
  }, config.heartbeatSeconds * 1000);
}

function reconnectDelayForError(error) {
  const message = clean(error && (error.code || error.message || String(error))).toLowerCase();
  if (message.includes("rate_limit") || message.includes("rate limited") || message.includes("too many connections")) {
    return 120_000;
  }
  return null;
}

function scheduleReconnect(delayOverride = null) {
  if (stopped) return;
  const delay = delayOverride || Math.min(config.reconnectMaxMs, config.reconnectMinMs * Math.pow(2, reconnectAttempt));
  reconnectAttempt += 1;
  log("reconnect_scheduled", { delayMs: delay, attempt: reconnectAttempt });
  setTimeout(connect, delay);
}

async function connect() {
  if (stopped) return;
  try {
    if (connection && connection.isConnected) await connection.disconnect();
  } catch (error) {}

  connection = new TikTokLiveConnection(config.username, {
    fetchRoomInfoOnConnect: true,
    enableExtendedGiftInfo: true,
    ...(config.signApiKey ? { signApiKey: config.signApiKey } : {}),
    ...(config.sessionCookie ? { session: { cookie: config.sessionCookie }, authenticateWs: true } : {})
  });
  attachHandlers(connection);

  try {
    const connectedState = await connection.connect();
    setLive(connectedState || {});
    log("connect_resolved", { roomId: state.roomId });
    await safeWrite("connect");
  } catch (error) {
    const offlineCode = error && (error.name === "UserOfflineError" || error.code === "USER_OFFLINE");
    if (offlineCode) {
      setOffline(null);
      log("offline");
      await safeWrite("offline");
    } else {
      markStale(error && (error.code || error.message) || "RUNTIME_CONNECT_FAILED");
      log("connect_error", { message: state.error });
      await safeWrite("connectError");
    }
    scheduleReconnect(reconnectDelayForError(error));
  }
}

async function shutdown() {
  stopped = true;
  clearInterval(heartbeatTimer);
  markStale("RUNTIME_SHUTDOWN");
  log("shutdown");
  await safeWrite("shutdown");
  if (connection && connection.isConnected) await connection.disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

scheduleHeartbeat();
connect();
