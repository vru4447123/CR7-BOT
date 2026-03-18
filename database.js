const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`;
const HEADERS = {
  "Content-Type":     "application/json",
  "X-Master-Key":     process.env.JSONBIN_API_KEY,
  "X-Bin-Versioning": "false",
};

const DEFAULT_DATA = {
  users:            {},
  shop:             [],
  stockMessages:    {},
  warnings:         {},
  redemptions:      [],
  nextRedemptionId: 1,
  codes:            {},   // { [CODE]: CodeObject }
  codeChannel:      null, // default announcement channel ID
};

class Database {
  constructor() {
    this.data           = JSON.parse(JSON.stringify(DEFAULT_DATA));
    this._ready         = false;
    this._saveQueue     = Promise.resolve();
    this._debounceTimer = null;
  }

  async init() {
    try {
      const res  = await fetch(JSONBIN_URL, { headers: HEADERS });
      const json = await res.json();
      if (!res.ok) {
        console.log("JSONBin: first run, pushing default data...");
        await this._push(DEFAULT_DATA);
        this.data = JSON.parse(JSON.stringify(DEFAULT_DATA));
      } else {
        this.data = json.record;
        if (!this.data.users)            this.data.users            = {};
        if (!this.data.shop)             this.data.shop             = [];
        if (!this.data.stockMessages)    this.data.stockMessages    = {};
        if (!this.data.warnings)         this.data.warnings         = {};
        if (!this.data.redemptions)      this.data.redemptions      = [];
        if (!this.data.nextRedemptionId) this.data.nextRedemptionId = 1;
        if (!this.data.codes)            this.data.codes            = {};
        if (this.data.codeChannel === undefined) this.data.codeChannel = null;
        console.log("✅ JSONBin loaded.");
      }
      this._ready = true;
    } catch (err) {
      console.error("JSONBin init error:", err);
      this.data   = JSON.parse(JSON.stringify(DEFAULT_DATA));
      this._ready = true;
    }
  }

  _push(data) {
    return fetch(JSONBIN_URL, {
      method:  "PUT",
      headers: HEADERS,
      body:    JSON.stringify(data),
    }).then((r) => {
      if (!r.ok) r.text().then((t) => console.error("JSONBin PUT error:", t));
    }).catch((e) => console.error("JSONBin PUT exception:", e));
  }

  // Debounced save — batches rapid writes (e.g. many messages) into one PUT
  save() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._push(this.data);
    }, 1500); // wait 1.5s after last write before pushing
  }

  // ── User ────────────────────────────────────────────────────────────────────
  getUser(userId, username) {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        userId,
        username: username || "Unknown",
        balance:  0,
        lastDaily: null,
        inventory: [],
      };
      // no save here — caller will save after mutating
    }
    return this.data.users[userId];
  }

  addCoins(userId, username, amount) {
    const u   = this.getUser(userId, username || "Unknown");
    u.balance = Math.max(0, u.balance + amount);
    this.save();
  }

  removeCoins(userId, amount) {
    const u = this.data.users[userId];
    if (!u) return;
    u.balance = Math.max(0, u.balance - amount);
    this.save();
  }

  setCoins(userId, username, amount) {
    const u   = this.getUser(userId, username);
    u.balance = Math.max(0, amount);
    this.save();
  }

  setLastDaily(userId, timestamp = Date.now()) {
    const u = this.data.users[userId];
    if (u) { u.lastDaily = timestamp; this.save(); }
  }

  getLeaderboard(limit = 10) {
    return Object.values(this.data.users)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);
  }

  // ── Inventory ───────────────────────────────────────────────────────────────
  getInventory(userId) {
    return this.data.users[userId]?.inventory ?? [];
  }

  addToInventory(userId, itemName) {
    if (!this.data.users[userId]) return;
    this.data.users[userId].inventory = this.data.users[userId].inventory ?? [];
    this.data.users[userId].inventory.push(itemName);
    this.save();
  }

  removeFromInventory(userId, itemName) {
    if (!this.data.users[userId]) return false;
    const inv = this.data.users[userId].inventory ?? [];
    const idx = inv.indexOf(itemName);
    if (idx === -1) return false;
    inv.splice(idx, 1);
    this.save();
    return true;
  }

  clearInventory(userId) {
    if (!this.data.users[userId]) return;
    this.data.users[userId].inventory = [];
    this.save();
  }

  // ── Shop ────────────────────────────────────────────────────────────────────
  getShopItems() { return this.data.shop ?? []; }

  addShopItem(item) {
    this.data.shop = this.data.shop ?? [];
    const idx = this.data.shop.findIndex(
      (i) => i.name.toLowerCase() === item.name.toLowerCase()
    );
    if (idx >= 0) this.data.shop[idx] = item;
    else          this.data.shop.push(item);
    this.save();
  }

  removeShopItem(name) {
    const before   = (this.data.shop ?? []).length;
    this.data.shop = (this.data.shop ?? []).filter(
      (i) => i.name.toLowerCase() !== name.toLowerCase()
    );
    this.save();
    return this.data.shop.length < before;
  }

  decrementStock(itemName) {
    const item = (this.data.shop ?? []).find(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (item && item.stock > 0) { item.stock -= 1; this.save(); }
  }

  // ── Stock Messages ───────────────────────────────────────────────────────────
  getStockMessage(channelId) {
    return this.data.stockMessages[channelId] ?? null;
  }

  setStockMessage(channelId, messageId) {
    this.data.stockMessages[channelId] = messageId;
    this.save();
  }

  // ── Warnings ────────────────────────────────────────────────────────────────
  addWarning(userId, username, reason, by) {
    this.data.warnings[userId] = this.data.warnings[userId] ?? [];
    this.data.warnings[userId].push({ reason, by, username });
    this.save();
    return this.data.warnings[userId].length;
  }

  getWarnings(userId) {
    return this.data.warnings[userId] ?? [];
  }

  clearWarnings(userId) {
    this.data.warnings[userId] = [];
    this.save();
  }

  // ── Redemptions ──────────────────────────────────────────────────────────────
  addRedemption(data) {
    const id = this.data.nextRedemptionId++;
    this.data.redemptions.push({ id, ...data });
    this.save();
    return id;
  }

  getRedemption(id) {
    return this.data.redemptions.find((r) => r.id === id) || null;
  }

  getPendingRedemptions() {
    return this.data.redemptions.filter((r) => r.status === "pending");
  }

  markRedemptionPaid(id, paidBy) {
    const r = this.data.redemptions.find((r) => r.id === id);
    if (r) {
      r.status = "paid";
      r.paidBy = paidBy;
      this.save();
    }
  }

  // ── Codes ────────────────────────────────────────────────────────────────────
  addCode(codeObj) {
    this.data.codes[codeObj.code] = codeObj;
    this.save();
  }

  getCode(code) {
    return this.data.codes[code.toUpperCase()] || null;
  }

  getAllCodes() {
    return Object.values(this.data.codes);
  }

  removeCode(code) {
    delete this.data.codes[code.toUpperCase()];
    this.save();
  }

  redeemCode(code, userId) {
    const c = this.data.codes[code.toUpperCase()];
    if (c) {
      c.uses += 1;
      c.usedBy.push(userId);
      this.save();
    }
  }

  // ── Code Channel ─────────────────────────────────────────────────────────────
  getCodeChannel() {
    return this.data.codeChannel || null;
  }

  setCodeChannel(channelId) {
    this.data.codeChannel = channelId;
    this.save();
  }
}

module.exports = Database;
