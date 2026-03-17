const fs   = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data.json");

const DEFAULT_DB = {
  users:         {},
  shop:          [],
  stockMessages: {},
  warnings:      {},
};

class Database {
  constructor() {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2));
    }
    this.data = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
    if (!this.data.shop)          this.data.shop          = [];
    if (!this.data.stockMessages) this.data.stockMessages = {};
    if (!this.data.warnings)      this.data.warnings      = {};
  }

  save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
  }

  // ─── User ───────────────────────────────────────────────────────────────────
  getUser(userId, username) {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        userId,
        username:    username || "Unknown",
        balance:     0,
        totalEarned: 0,
        messages:    0,
        lastDaily:   null,
        inventory:   [],
      };
      this.save();
    }
    return this.data.users[userId];
  }

  addCoins(userId, username, amount) {
    const u      = this.getUser(userId, username || "Unknown");
    u.balance   += amount;
    u.totalEarned += amount;
    u.messages  += 1;
    if (u.balance < 0) u.balance = 0;
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

  // ─── Inventory ──────────────────────────────────────────────────────────────
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

  // ─── Shop ───────────────────────────────────────────────────────────────────
  getShopItems() { return this.data.shop ?? []; }

  addShopItem(item) {
    this.data.shop = this.data.shop ?? [];
    const idx = this.data.shop.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase());
    if (idx >= 0) this.data.shop[idx] = item;
    else          this.data.shop.push(item);
    this.save();
  }

  removeShopItem(name) {
    const before   = (this.data.shop ?? []).length;
    this.data.shop = (this.data.shop ?? []).filter(i => i.name.toLowerCase() !== name.toLowerCase());
    this.save();
    return this.data.shop.length < before;
  }

  decrementStock(itemName) {
    const item = (this.data.shop ?? []).find(i => i.name.toLowerCase() === itemName.toLowerCase());
    if (item && item.stock > 0) { item.stock -= 1; this.save(); }
  }

  // ─── Stock Messages ─────────────────────────────────────────────────────────
  getStockMessage(channelId) { return this.data.stockMessages[channelId] ?? null; }

  setStockMessage(channelId, messageId) {
    this.data.stockMessages[channelId] = messageId;
    this.save();
  }

  // ─── Warnings ───────────────────────────────────────────────────────────────
  addWarning(userId, username, reason, by) {
    this.data.warnings[userId] = this.data.warnings[userId] ?? [];
    this.data.warnings[userId].push({ reason, by, timestamp: Date.now(), username });
    this.save();
    return this.data.warnings[userId].length;
  }

  getWarnings(userId) { return this.data.warnings[userId] ?? []; }

  clearWarnings(userId) {
    this.data.warnings[userId] = [];
    this.save();
  }
}

module.exports = Database;
