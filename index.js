const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits, MessageFlags,
} = require('discord.js');

// ══════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════
const COIN   = '<:len:1484091421014360194>';
const ROBUX  = '<:robux:1484091318241202266>';
function fmt(n) { return `${COIN} **${Number(n).toLocaleString()} LEN**`; }

// ══════════════════════════════════════════════════════════════════
//  JSONBIN DATABASE
//  Railway env vars needed:
//    JSONBIN_BIN_ID   — bin ID from jsonbin.io
//    JSONBIN_API_KEY  — your Master Key ($2a$10$...)
//    DISCORD_TOKEN    — bot token
//    CLIENT_ID        — application ID
// ══════════════════════════════════════════════════════════════════
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${process.env.JSONBIN_BIN_ID}`;
const JSONBIN_HEADERS = {
  'Content-Type': 'application/json',
  'X-Master-Key': process.env.JSONBIN_API_KEY,
  'X-Bin-Versioning': 'false',
};

let _cache = null;

async function loadDB() {
  if (_cache) return _cache;
  try {
    const res  = await fetch(JSONBIN_URL, { headers: JSONBIN_HEADERS });
    const json = await res.json();
    _cache = json.record || json;
    if (!_cache.users)         _cache.users         = {};
    if (!_cache.warnings)      _cache.warnings      = {};
    if (!_cache.codes)         _cache.codes         = {};
    if (!_cache.shopItems)     _cache.shopItems     = [];
    if (!_cache.stockMessages) _cache.stockMessages = {};
    if (!_cache.codeChannel)   _cache.codeChannel   = null;
    if (!_cache.redeems)       _cache.redeems       = {};
    if (!_cache.redeemCounter) _cache.redeemCounter = 1;
    if (!_cache.invites)       _cache.invites       = {};
    if (!_cache.hasJoined)     _cache.hasJoined     = {};
  } catch (err) {
    console.error('JSONBin load failed:', err.message);
    _cache = {
      users: {}, warnings: {}, codes: {}, shopItems: [],
      stockMessages: {}, codeChannel: null,
      redeems: {}, redeemCounter: 1, invites: {}, hasJoined: {},
    };
  }
  return _cache;
}

let _saveTimer = null;
async function saveDB() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    try {
      await fetch(JSONBIN_URL, {
        method: 'PUT',
        headers: JSONBIN_HEADERS,
        body: JSON.stringify(_cache),
      });
    } catch (err) {
      console.error('JSONBin save failed:', err.message);
    }
  }, 1500);
}

// ── users ─────────────────────────────────────────────────────────
async function getUser(uid, username) {
  const db = await loadDB();
  if (!db.users[uid]) {
    db.users[uid] = { username: username || 'Unknown', balance: 0, inventory: [], lastDaily: 0 };
    await saveDB();
  }
  return db.users[uid];
}
async function saveUser(uid, data) {
  const db = await loadDB();
  db.users[uid] = data;
  await saveDB();
}
async function dbAddCoins(uid, username, amt) {
  const db = await loadDB();
  if (!db.users[uid]) db.users[uid] = { username: username || 'Unknown', balance: 0, inventory: [], lastDaily: 0 };
  db.users[uid].balance += amt;
  await saveDB();
  return db.users[uid].balance;
}
async function dbRemoveCoins(uid, amt) {
  const db = await loadDB();
  if (!db.users[uid]) db.users[uid] = { username: 'Unknown', balance: 0, inventory: [], lastDaily: 0 };
  db.users[uid].balance = Math.max(0, db.users[uid].balance - amt);
  await saveDB();
  return db.users[uid].balance;
}
async function dbSetCoins(uid, username, amt) {
  const db = await loadDB();
  if (!db.users[uid]) db.users[uid] = { username: username || 'Unknown', balance: 0, inventory: [], lastDaily: 0 };
  db.users[uid].balance = amt;
  await saveDB();
}
async function dbSetLastDaily(uid, ts) {
  const db = await loadDB();
  if (!db.users[uid]) db.users[uid] = { username: 'Unknown', balance: 0, inventory: [], lastDaily: 0 };
  db.users[uid].lastDaily = ts === undefined ? Date.now() : ts;
  await saveDB();
}
async function dbAddInventory(uid, item) {
  const db = await loadDB();
  if (!db.users[uid]) db.users[uid] = { username: 'Unknown', balance: 0, inventory: [], lastDaily: 0 };
  db.users[uid].inventory.push(item);
  await saveDB();
}
async function dbRemoveInventory(uid, item) {
  const db = await loadDB();
  if (!db.users[uid]) return false;
  const idx = db.users[uid].inventory.findIndex(i => i.toLowerCase().includes(item.toLowerCase()));
  if (idx === -1) return false;
  db.users[uid].inventory.splice(idx, 1);
  await saveDB();
  return true;
}
async function dbClearInventory(uid) {
  const db = await loadDB();
  if (db.users[uid]) { db.users[uid].inventory = []; await saveDB(); }
}
async function dbGetInventory(uid) {
  const db = await loadDB();
  return db.users[uid]?.inventory || [];
}
async function dbLeaderboard(n) {
  const db = await loadDB();
  return Object.entries(db.users)
    .map(([userId, d]) => ({ userId, balance: d.balance }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, n);
}

// ── warnings ──────────────────────────────────────────────────────
async function dbAddWarning(uid, username, reason, by) {
  const db = await loadDB();
  if (!db.warnings[uid]) db.warnings[uid] = [];
  db.warnings[uid].push({ reason, by });
  await saveDB();
  return db.warnings[uid].length;
}
async function dbGetWarnings(uid) { const db = await loadDB(); return db.warnings[uid] || []; }
async function dbClearWarnings(uid) { const db = await loadDB(); db.warnings[uid] = []; await saveDB(); }

// ── shop items ────────────────────────────────────────────────────
async function dbGetShopItems() { const db = await loadDB(); return db.shopItems || []; }
async function dbAddShopItem(item) { const db = await loadDB(); db.shopItems.push(item); await saveDB(); }
async function dbRemoveShopItem(name) {
  const db = await loadDB();
  const idx = db.shopItems.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) return false;
  db.shopItems.splice(idx, 1); await saveDB(); return true;
}
async function dbDecrementStock(name) {
  const db = await loadDB();
  const item = db.shopItems.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (item && item.stock > 0) { item.stock--; await saveDB(); }
}

// ── stock messages ────────────────────────────────────────────────
async function dbGetStockMsg(channelId) { const db = await loadDB(); return db.stockMessages[channelId] || null; }
async function dbSetStockMsg(channelId, msgId) {
  const db = await loadDB(); db.stockMessages[channelId] = msgId; await saveDB();
}

// ── codes ─────────────────────────────────────────────────────────
async function dbGetCode(code) { const db = await loadDB(); return db.codes[code] || null; }
async function dbGetAllCodes() { const db = await loadDB(); return Object.values(db.codes); }
async function dbAddCode(entry) { const db = await loadDB(); db.codes[entry.code] = entry; await saveDB(); }
async function dbRemoveCode(code) { const db = await loadDB(); delete db.codes[code]; await saveDB(); }
async function dbRedeemCode(code, uid) {
  const db = await loadDB();
  if (!db.codes[code]) return;
  db.codes[code].uses++;
  db.codes[code].usedBy.push(uid);
  await saveDB();
}
async function dbGetCodeChannel() { const db = await loadDB(); return db.codeChannel || null; }
async function dbSetCodeChannel(id) { const db = await loadDB(); db.codeChannel = id; await saveDB(); }

// ── redeems ───────────────────────────────────────────────────────
async function dbAddRedeem(data) {
  const db = await loadDB();
  const id = db.redeemCounter++;
  db.redeems[id] = { id, ...data, status: 'pending' };
  await saveDB();
  return id;
}
async function dbGetRedeem(id) { const db = await loadDB(); return db.redeems[id] || null; }
async function dbGetPendingRedeems() {
  const db = await loadDB();
  return Object.values(db.redeems).filter(r => r.status === 'pending');
}
async function dbMarkRedeemDone(id, by) {
  const db = await loadDB();
  if (!db.redeems[id]) return;
  db.redeems[id].status = 'paid';
  db.redeems[id].processedBy = by;
  await saveDB();
}

// ══════════════════════════════════════════════════════════════════
//  CODE EXPIRY CHECKER — runs every 30 seconds
// ══════════════════════════════════════════════════════════════════
async function checkCodeExpiry() {
  const db  = await loadDB();
  const now = Date.now();
  let changed = false;
  for (const code of Object.values(db.codes)) {
    if (code.expired) continue;
    const expiredByTime = code.expiresAt && now > code.expiresAt;
    const expiredByUses = code.maxUses > 0 && code.uses >= code.maxUses;
    if (expiredByTime || expiredByUses) {
      code.expired = true;
      changed = true;
      if (code.announceChannelId && code.announceMessageId) {
        try {
          const ch  = await client.channels.fetch(code.announceChannelId);
          const msg = await ch.messages.fetch(code.announceMessageId);
          const ts  = code.expiresAt ? Math.floor(code.expiresAt / 1000) : Math.floor(Date.now() / 1000);
          await msg.edit({
            embeds: [new EmbedBuilder().setColor(0x888888).setTitle('❌ Code Expired')
              .setDescription(
                `~~**Code:** \`${code.code}\`~~\n**Reward:** ${fmt(code.reward)}\n` +
                `Expired: <t:${ts}:F>\n**Total uses:** ${code.uses}`
              )],
          });
        } catch { /* deleted or no perms */ }
      }
    }
  }
  if (changed) await saveDB();
}

// ══════════════════════════════════════════════════════════════════
//  SHOP PACKAGES  — 100 LEN = 25 Robux
// ══════════════════════════════════════════════════════════════════
const SHOP_PACKAGES = [
  { name: 'Robux S',   coins: 100,  robux: 25  },
  { name: 'Robux M',   coins: 300,  robux: 75  },
  { name: 'Robux L',   coins: 700,  robux: 175 },
  { name: 'Robux XL',  coins: 1500, robux: 375 },
  { name: 'Robux XXL', coins: 3000, robux: 750 },
];

// ══════════════════════════════════════════════════════════════════
//  PERMISSION GUARDS
// ══════════════════════════════════════════════════════════════════
function stripRole(name) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.some(r => stripRole(r.name).includes('admin perm'));
}
function isOwnerOrCoOwner(member) {
  if (!member) return false;
  return member.roles.cache.some(r => {
    const n = stripRole(r.name);
    return n === 'owner' || n.includes('co owner') || n.includes('co-owner') || n.includes('coowner');
  });
}
function isVerified(member) {
  if (!member) return false;
  return member.roles.cache.some(r => stripRole(r.name) === 'verified');
}
async function guardDebt(i) {
  const user = await getUser(i.user.id, i.user.username);
  if (user.balance < 0) {
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle('🔒 Account Locked — You Are in Debt!')
        .setDescription(
          `Your balance is ${fmt(user.balance)} (negative).\n\n` +
          `Your shop, inventory and purchases are **locked** until you get out of debt.\n\n` +
          `**How to get out of debt:**\n` +
          `• Invite new members — each valid invite gives you **+100 LEN**\n` +
          `• Send messages — **1 LEN** per message\n` +
          `• Use \`/daily\` for **+100 LEN** every 24h`
        )],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
async function guardAdmin(i) {
  if (!isAdmin(i.member)) {
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle('🚫 Access Denied')
        .setDescription('You need the **Admin Perm** role or **Administrator** permission.')],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}
async function guardOwner(i) {
  if (!isOwnerOrCoOwner(i.member)) {
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle('🚫 Access Denied')
        .setDescription('Only **Owner** or **Co-Owner** can use this.')],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════
//  SLASH COMMAND DEFINITIONS
// ══════════════════════════════════════════════════════════════════
const commands = [
  // Economy
  new SlashCommandBuilder().setName('balance').setDescription('Check your LEN Coin balance')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily 100 LEN Coins'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top 10 richest users'),
  new SlashCommandBuilder().setName('pay').setDescription('Send LEN Coins to another user (Verified role required)')
    .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),

  // Gambling
  new SlashCommandBuilder().setName('coinflip').setDescription('Flip a coin — win 2x or lose your bet')
    .addStringOption(o => o.setName('side').setDescription('heads or tails').setRequired(true)
      .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('slots').setDescription('Spin the slot machine!')
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('blackjack').setDescription('Play Blackjack!')
    .addIntegerOption(o => o.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1)),

  // Shop & Inventory
  new SlashCommandBuilder().setName('shop').setDescription('Browse the LEN Coin shop'),
  new SlashCommandBuilder().setName('buy').setDescription('Buy a Robux package from the shop')
    .addStringOption(o => o.setName('item').setDescription('Package name from /shop').setRequired(true)),
  new SlashCommandBuilder().setName('inventory').setDescription('View your inventory')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(false)),
  new SlashCommandBuilder().setName('use').setDescription('Redeem an item — enter your Roblox username')
    .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),

  // Redemption Admin
  new SlashCommandBuilder().setName('check-redeems').setDescription('[Admin] View all pending redemption requests'),
  new SlashCommandBuilder().setName('finish-redeem').setDescription('[Admin] Mark a redemption as done and DM the user')
    .addIntegerOption(o => o.setName('id').setDescription('Redemption ID').setRequired(true)),

  // Codes
  new SlashCommandBuilder().setName('drop-code').setDescription('[Admin] Drop a timed code that gives LEN Coins')
    .addStringOption(o => o.setName('code').setDescription('Code word').setRequired(true))
    .addIntegerOption(o => o.setName('reward').setDescription('LEN Coins rewarded').setRequired(true).setMinValue(1))
    .addIntegerOption(o => o.setName('minutes').setDescription('Expiry in minutes (0 = never)').setRequired(true).setMinValue(0))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to announce in').setRequired(false))
    .addIntegerOption(o => o.setName('max_uses').setDescription('Max uses (0 = unlimited)').setRequired(false).setMinValue(0)),
  new SlashCommandBuilder().setName('make-code').setDescription('[Admin] Create a permanent code')
    .addStringOption(o => o.setName('code').setDescription('Code word').setRequired(true))
    .addIntegerOption(o => o.setName('reward').setDescription('LEN Coins rewarded').setRequired(true).setMinValue(1))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to announce in').setRequired(false))
    .addIntegerOption(o => o.setName('max_uses').setDescription('Max uses (0 = unlimited)').setRequired(false).setMinValue(0)),
  new SlashCommandBuilder().setName('remove-code').setDescription('[Admin] Delete a code')
    .addStringOption(o => o.setName('code').setDescription('Code to remove').setRequired(true))
    .addChannelOption(o => o.setName('channel').setDescription('Channel to announce removal').setRequired(false)),
  new SlashCommandBuilder().setName('redeem-code').setDescription('Redeem a code for LEN Coins')
    .addStringOption(o => o.setName('code').setDescription('The code').setRequired(true)),
  new SlashCommandBuilder().setName('codes').setDescription('[Admin] View all active codes'),
  new SlashCommandBuilder().setName('set-code-channel').setDescription('[Admin] Set default code announcement channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)),

  // Info
  new SlashCommandBuilder().setName('userinfo').setDescription('View info about a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false)),
  new SlashCommandBuilder().setName('serverinfo').setDescription('View server info'),

  // Stock Admin
  new SlashCommandBuilder().setName('show-stock').setDescription('[Admin] Post a Robux stock embed in a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Robux amount in stock').setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName('set-stock').setDescription('[Admin] Update existing Robux stock embed')
    .addChannelOption(o => o.setName('channel').setDescription('Channel with the embed').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('New Robux amount').setRequired(true).setMinValue(0)),

  // Economy Admin
  new SlashCommandBuilder().setName('givecoin').setDescription('[Owner/Co-Owner] Add LEN Coins to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('removecoin').setDescription('[Owner/Co-Owner] Remove LEN Coins from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('setcoins').setDescription('[Admin] Set a user\'s exact balance')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(0)),
  new SlashCommandBuilder().setName('resetdaily').setDescription('[Admin] Reset a user\'s daily cooldown')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  // Shop Admin
  new SlashCommandBuilder().setName('additem').setDescription('[Admin] Add a custom item to the shop')
    .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
    .addIntegerOption(o => o.setName('price').setDescription('Price in LEN Coins').setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName('description').setDescription('Description').setRequired(true))
    .addStringOption(o => o.setName('emoji').setDescription('Emoji').setRequired(false))
    .addIntegerOption(o => o.setName('stock').setDescription('Stock (-1 = unlimited)').setRequired(false)),
  new SlashCommandBuilder().setName('removeitem').setDescription('[Admin] Remove a custom item from the shop')
    .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true)),
  new SlashCommandBuilder().setName('giveitem').setDescription('[Admin] Give an item directly to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
  new SlashCommandBuilder().setName('clearinventory').setDescription('[Admin] Clear a user\'s entire inventory')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),

  // Moderation
  new SlashCommandBuilder().setName('warn').setDescription('[Admin] Warn a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('[Admin] View a user\'s warnings')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('[Admin] Clear all warnings for a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('[Admin] Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('untimeout').setDescription('[Admin] Remove timeout from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('[Admin] Kick a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('ban').setDescription('[Admin] Ban a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
    .addIntegerOption(o => o.setName('delete_days').setDescription('Delete message history (0-7 days)').setRequired(false).setMinValue(0).setMaxValue(7)),
  new SlashCommandBuilder().setName('unban').setDescription('[Admin] Unban a user by ID')
    .addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('purge').setDescription('[Admin] Delete multiple messages')
    .addIntegerOption(o => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Only delete from this user').setRequired(false)),
  new SlashCommandBuilder().setName('slowmode').setDescription('[Admin] Set channel slowmode')
    .addIntegerOption(o => o.setName('seconds').setDescription('Seconds (0 = off)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)').setRequired(false)),
  new SlashCommandBuilder().setName('lock').setDescription('[Admin] Lock a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)').setRequired(false))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false)),
  new SlashCommandBuilder().setName('unlock').setDescription('[Admin] Unlock a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Channel (defaults to current)').setRequired(false)),
  new SlashCommandBuilder().setName('announce').setDescription('[Admin] Send an announcement embed')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('title').setDescription('Title').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true))
    .addStringOption(o => o.setName('color').setDescription('Hex color e.g. ff0000').setRequired(false)),

  // Help
  new SlashCommandBuilder().setName('help').setDescription('View all commands'),
  new SlashCommandBuilder().setName('adminhelp').setDescription('[Admin] View all admin commands'),
  new SlashCommandBuilder().setName('tutorial').setDescription('How to use the bot — guide for new users'),
  new SlashCommandBuilder().setName('admin-tutorial').setDescription('How to set up admin roles and permissions'),
  new SlashCommandBuilder().setName('owner-tutorial').setDescription('Full bot guide — only for the bot owner'),
].map(c => c.toJSON());

// ══════════════════════════════════════════════════════════════════
//  CLIENT
// ══════════════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
  ],
});

// ── Register commands ─────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  console.log('🧹 Clearing old global commands...');
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log('✅ Global commands cleared.');
  } catch (err) { console.error('❌ Clear global failed:', err.message); }

  for (const [guildId] of client.guilds.cache) {
    try {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: [] });
      console.log(`🧹 Guild ${guildId} cleared.`);
    } catch (err) { console.error(`❌ Clear guild ${guildId} failed:`, err.message); }
    try {
      await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId), { body: commands });
      console.log(`✅ Guild ${guildId} registered (${commands.length} commands).`);
    } catch (err) { console.error(`❌ Register guild ${guildId} failed:`, err.message); }
  }
  console.log('✅ All commands registered!');
}

// ══════════════════════════════════════════════════════════════════
//  INVITE TRACKING
// ══════════════════════════════════════════════════════════════════
const inviteCache = new Map();

async function buildInviteCache(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    invites.each(inv => map.set(inv.code, { uses: inv.uses, inviterId: inv.inviter?.id || null }));
    inviteCache.set(guild.id, map);
  } catch { /* no perms */ }
}

client.on('guildCreate',    async guild  => { await buildInviteCache(guild); });
client.on('inviteCreate',   invite => {
  const map = inviteCache.get(invite.guild.id) || new Map();
  map.set(invite.code, { uses: invite.uses, inviterId: invite.inviter?.id || null });
  inviteCache.set(invite.guild.id, map);
});
client.on('inviteDelete',   invite => {
  const map = inviteCache.get(invite.guild.id);
  if (map) map.delete(invite.code);
});

client.on('guildMemberAdd', async member => {
  const guild  = member.guild;
  const oldMap = inviteCache.get(guild.id) || new Map();
  let usedInvite = null;
  try {
    const newInvites = await guild.invites.fetch();
    newInvites.each(inv => {
      const cached = oldMap.get(inv.code);
      if (cached && inv.uses > cached.uses) usedInvite = inv;
    });
    const newMap = new Map();
    newInvites.each(inv => newMap.set(inv.code, { uses: inv.uses, inviterId: inv.inviter?.id || null }));
    inviteCache.set(guild.id, newMap);
  } catch { return; }

  if (!usedInvite || !usedInvite.inviter) return;

  const db = await loadDB();
  if (!db.invites)   db.invites   = {};
  if (!db.hasJoined) db.hasJoined = {};

  const inviterId  = usedInvite.inviter.id;
  const inviterTag = usedInvite.inviter.tag;
  const hasJoinedBefore = db.hasJoined[member.id] === true;

  if (hasJoinedBefore) {
    try { await member.user.send({ embeds: [new EmbedBuilder().setColor(0xff8800)
      .setTitle(`👋 Welcome Back to ${guild.name}!`)
      .setDescription(`You rejoined **${guild.name}** using **${inviterTag}**'s invite.\n\n⚠️ Since you've been here before, **no coins** were awarded to your inviter.`)
      .setThumbnail(guild.iconURL())] }); } catch { /* DMs closed */ }
    try {
      const inviterUser = await client.users.fetch(inviterId);
      await inviterUser.send({ embeds: [new EmbedBuilder().setColor(0xff8800)
        .setTitle('⚠️ Rejoin — No Coins Awarded')
        .setDescription(`**${member.user.tag}** rejoined **${guild.name}** using your invite.\nSince they were already here before, **no coins** were awarded.`)
        .setThumbnail(member.user.displayAvatarURL())] });
    } catch { /* DMs closed */ }
    return;
  }

  db.hasJoined[member.id] = true;
  db.invites[member.id]   = { inviterId, guildId: guild.id };
  await saveDB();

  await dbAddCoins(inviterId, usedInvite.inviter.username, 100);
  const inviterBal = (await getUser(inviterId)).balance;

  try {
    const inviterUser = await client.users.fetch(inviterId);
    await inviterUser.send({ embeds: [new EmbedBuilder().setColor(0x00ff88)
      .setTitle('🎉 Someone Joined Using Your Invite!')
      .setDescription(`**${member.user.tag}** just joined **${guild.name}** using your invite!\n\n${COIN} You earned **+100 LEN**\n💰 New balance: **${inviterBal.toLocaleString()} LEN**`)
      .setThumbnail(member.user.displayAvatarURL())] });
  } catch { /* DMs closed */ }

  try {
    await member.user.send({ embeds: [new EmbedBuilder().setColor(0x00b4ff)
      .setTitle(`👋 Welcome to ${guild.name}!`)
      .setDescription(`You were invited by **${inviterTag}**.\n\nStart earning ${COIN} LEN Coins by chatting, use \`/daily\` for free coins, and check \`/shop\` for Robux packages!\n\nUse \`/help\` to see all commands.`)
      .setThumbnail(guild.iconURL())] });
  } catch { /* DMs closed */ }
});

client.on('guildMemberRemove', async member => {
  const db = await loadDB();
  if (!db.invites) return;
  const record = db.invites[member.id];
  if (!record) return;
  const inviterId   = record.inviterId;
  const inviterData = await getUser(inviterId);
  inviterData.balance -= 100;
  await saveUser(inviterId, inviterData);
  const newBal = inviterData.balance;
  delete db.invites[member.id];
  await saveDB();
  try {
    const inviterUser = await client.users.fetch(inviterId);
    await inviterUser.send({ embeds: [new EmbedBuilder().setColor(0xff4444)
      .setTitle('😔 Your Invite Left the Server')
      .setDescription(
        `**${member.user.tag}** just left **${member.guild.name}**.\n\n` +
        `${COIN} You lost **-100 LEN**\n` +
        `💰 New balance: **${newBal.toLocaleString()} LEN**${newBal < 0 ? ' ⚠️ (negative!)' : ''}`
      )
      .setThumbnail(member.user.displayAvatarURL())] });
  } catch { /* DMs closed */ }
});

// ══════════════════════════════════════════════════════════════════
//  MESSAGE COUNTING — 1 message = 1 LEN Coin
// ══════════════════════════════════════════════════════════════════
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  await dbAddCoins(message.author.id, message.author.username, 1);
});

// ══════════════════════════════════════════════════════════════════
//  INTERACTION ROUTER
// ══════════════════════════════════════════════════════════════════
client.on('interactionCreate', async interaction => {
  if (interaction.isButton())      return handleButton(interaction);
  if (interaction.isModalSubmit()) return handleModal(interaction);
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'balance':          return cmdBalance(interaction);
      case 'daily':            return cmdDaily(interaction);
      case 'leaderboard':      return cmdLeaderboard(interaction);
      case 'pay':              return cmdPay(interaction);
      case 'coinflip':         return cmdCoinflip(interaction);
      case 'slots':            return cmdSlots(interaction);
      case 'blackjack':        return cmdBlackjack(interaction);
      case 'shop':             return cmdShop(interaction);
      case 'buy':              return cmdBuy(interaction);
      case 'inventory':        return cmdInventory(interaction);
      case 'use':              return cmdUse(interaction);
      case 'check-redeems':    return cmdCheckRedeems(interaction);
      case 'finish-redeem':    return cmdFinishRedeem(interaction);
      case 'drop-code':        return cmdDropCode(interaction);
      case 'make-code':        return cmdMakeCode(interaction);
      case 'remove-code':      return cmdRemoveCode(interaction);
      case 'redeem-code':      return cmdRedeemCode(interaction);
      case 'codes':            return cmdCodes(interaction);
      case 'set-code-channel': return cmdSetCodeChannel(interaction);
      case 'userinfo':         return cmdUserinfo(interaction);
      case 'serverinfo':       return cmdServerinfo(interaction);
      case 'show-stock':       return cmdShowStock(interaction);
      case 'set-stock':        return cmdSetStock(interaction);
      case 'givecoin':         return cmdGiveCoin(interaction);
      case 'removecoin':       return cmdRemoveCoin(interaction);
      case 'setcoins':         return cmdSetCoins(interaction);
      case 'resetdaily':       return cmdResetDaily(interaction);
      case 'additem':          return cmdAddItem(interaction);
      case 'removeitem':       return cmdRemoveItem(interaction);
      case 'giveitem':         return cmdGiveItem(interaction);
      case 'clearinventory':   return cmdClearInventory(interaction);
      case 'warn':             return cmdWarn(interaction);
      case 'warnings':         return cmdWarnings(interaction);
      case 'clearwarnings':    return cmdClearWarnings(interaction);
      case 'timeout':          return cmdTimeout(interaction);
      case 'untimeout':        return cmdUntimeout(interaction);
      case 'kick':             return cmdKick(interaction);
      case 'ban':              return cmdBan(interaction);
      case 'unban':            return cmdUnban(interaction);
      case 'purge':            return cmdPurge(interaction);
      case 'slowmode':         return cmdSlowmode(interaction);
      case 'lock':             return cmdLock(interaction);
      case 'unlock':           return cmdUnlock(interaction);
      case 'announce':         return cmdAnnounce(interaction);
      case 'help':             return cmdHelp(interaction);
      case 'adminhelp':        return cmdAdminHelp(interaction);
      case 'tutorial':         return cmdTutorial(interaction);
      case 'admin-tutorial':   return cmdAdminTutorial(interaction);
      case 'owner-tutorial':   return cmdOwnerTutorial(interaction);
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const payload = { content: '⚠️ Something went wrong. Please try again.', flags: MessageFlags.Ephemeral };
    interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
  }
});

// ══════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS
// ══════════════════════════════════════════════════════════════════
async function cmdBalance(i) {
  const target = i.options.getUser('user') || i.user;
  const data   = await getUser(target.id, target.username);
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0xffd700)
      .setTitle(`${COIN} ${target.username}'s Balance`)
      .setThumbnail(target.displayAvatarURL())
      .setDescription(`**Balance:** ${fmt(data.balance)}`)
      .setFooter({ text: '1 message = 1 LEN Coin • 100 LEN = 25 Robux' })],
  });
}

async function cmdDaily(i) {
  const data = await getUser(i.user.id, i.user.username);
  const now  = Date.now();
  const CD   = 24 * 60 * 60 * 1000;
  if (data.lastDaily && now - data.lastDaily < CD) {
    const nextDaily = Math.floor((data.lastDaily + CD) / 1000);
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle('⏰ Already Claimed')
        .setDescription(`You already claimed your daily!\nCome back <t:${nextDaily}:R> — <t:${nextDaily}:F>`)],
      flags: MessageFlags.Ephemeral,
    });
  }
  await dbAddCoins(i.user.id, i.user.username, 100);
  await dbSetLastDaily(i.user.id);
  const newBal = (await getUser(i.user.id)).balance;
  const nextTs = Math.floor((Date.now() + CD) / 1000);
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('🎁 Daily Reward!')
      .setDescription(`You received ${fmt(100)}!\nBalance: ${fmt(newBal)}\n\nNext daily: <t:${nextTs}:R>`)
      .setThumbnail(i.user.displayAvatarURL())],
  });
}

async function cmdLeaderboard(i) {
  const top  = await dbLeaderboard(10);
  const desc = top.map((u, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `**${idx + 1}.**`;
    return `${medal} <@${u.userId}> — ${fmt(u.balance)}`;
  }).join('\n') || 'No users yet!';
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0xffd700).setTitle(`${COIN} LEN Coin Leaderboard`).setDescription(desc)],
  });
}

async function cmdPay(i) {
  if (!isVerified(i.member))
    return i.reply({ content: '❌ You need the **Verified** role to send coins.', flags: MessageFlags.Ephemeral });
  const target = i.options.getUser('user');
  const amount = i.options.getInteger('amount');
  if (target.id === i.user.id) return i.reply({ content: "❌ Can't pay yourself!", flags: MessageFlags.Ephemeral });
  if (target.bot) return i.reply({ content: "❌ Can't pay bots!", flags: MessageFlags.Ephemeral });
  const sender = await getUser(i.user.id, i.user.username);
  if (sender.balance < amount)
    return i.reply({ content: `❌ You only have ${fmt(sender.balance)}.`, flags: MessageFlags.Ephemeral });
  await dbRemoveCoins(i.user.id, amount);
  await dbAddCoins(target.id, target.username, amount);
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('💸 Transfer Successful')
      .setDescription(`**${i.user.username}** sent ${fmt(amount)} to **${target.username}**`)],
  });
}

// ══════════════════════════════════════════════════════════════════
//  GAMBLING
// ══════════════════════════════════════════════════════════════════
async function cmdCoinflip(i) {
  if (!await guardDebt(i)) return;
  const side = i.options.getString('side');
  const bet  = i.options.getInteger('bet');
  const user = await getUser(i.user.id, i.user.username);
  if (user.balance < bet)
    return i.reply({ content: `❌ You only have ${fmt(user.balance)}.`, flags: MessageFlags.Ephemeral });
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won    = result === side;
  won ? await dbAddCoins(i.user.id, i.user.username, bet) : await dbRemoveCoins(i.user.id, bet);
  const newBal = (await getUser(i.user.id)).balance;
  return i.reply({
    embeds: [new EmbedBuilder().setColor(won ? 0x00ff88 : 0xff4444)
      .setTitle(won ? '🪙 You Won!' : '🪙 You Lost!')
      .setDescription(
        `The coin landed on **${result}** ${result === 'heads' ? '👑' : '🔵'}\n` +
        `You guessed **${side}**\n\n` +
        (won ? `✅ Won ${fmt(bet)}!` : `❌ Lost ${fmt(bet)}`) +
        `\n\n💰 Balance: ${fmt(newBal)}`
      )],
  });
}

async function cmdSlots(i) {
  if (!await guardDebt(i)) return;
  const bet  = i.options.getInteger('bet');
  const user = await getUser(i.user.id, i.user.username);
  if (user.balance < bet)
    return i.reply({ content: `❌ You only have ${fmt(user.balance)}.`, flags: MessageFlags.Ephemeral });
  const symbols = ['🍒','🍋','🍊','🍇','⭐','💎','7️⃣'];
  const weights = [30, 20, 20, 15, 10, 4, 1];
  function spin() {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let j = 0; j < symbols.length; j++) { r -= weights[j]; if (r <= 0) return symbols[j]; }
    return symbols[0];
  }
  const reels = [spin(), spin(), spin()];
  let mult = 0, resultText = '❌ No match — better luck next time!';
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    if      (reels[0] === '7️⃣') { mult = 20; resultText = '🎰 **JACKPOT! 7-7-7!** 20×!'; }
    else if (reels[0] === '💎')  { mult = 10; resultText = '💎 **Triple Diamonds!** 10×!'; }
    else if (reels[0] === '⭐')  { mult = 5;  resultText = '⭐ **Triple Stars!** 5×!'; }
    else                          { mult = 3;  resultText = `🎉 **Triple ${reels[0]}!** 3×!`; }
  } else if (reels[0]===reels[1] || reels[1]===reels[2] || reels[0]===reels[2]) {
    mult = 1.5; resultText = '✨ Two of a kind! 1.5×!';
  }
  let win = 0;
  if (mult > 0) { win = Math.floor(bet * mult); await dbAddCoins(i.user.id, i.user.username, win - bet); }
  else { await dbRemoveCoins(i.user.id, bet); }
  const newBal = (await getUser(i.user.id)).balance;
  return i.reply({
    embeds: [new EmbedBuilder().setColor(mult > 0 ? 0xffd700 : 0xff4444).setTitle('🎰 Slot Machine')
      .setDescription(
        `**[ ${reels.join(' | ')} ]**\n\n${resultText}\n\n` +
        (mult > 0 ? `✅ Won ${fmt(win)} (+${fmt(win - bet)})` : `❌ Lost ${fmt(bet)}`) +
        `\n💰 Balance: ${fmt(newBal)}`
      )],
  });
}

// ── Blackjack ─────────────────────────────────────────────────────
const bjGames = new Map();

async function cmdBlackjack(i) {
  if (!await guardDebt(i)) return;
  const bet  = i.options.getInteger('bet');
  const user = await getUser(i.user.id, i.user.username);
  if (user.balance < bet)
    return i.reply({ content: `❌ You only have ${fmt(user.balance)}.`, flags: MessageFlags.Ephemeral });
  const deck = buildDeck();
  const ph   = [drawCard(deck), drawCard(deck)];
  const dh   = [drawCard(deck), drawCard(deck)];
  bjGames.set(i.user.id, { bet, deck, ph, dh });
  await dbRemoveCoins(i.user.id, bet);
  if (handValue(ph) === 21) {
    const win = Math.floor(bet * 2.5);
    await dbAddCoins(i.user.id, i.user.username, win);
    bjGames.delete(i.user.id);
    const newBal = (await getUser(i.user.id)).balance;
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0xffd700).setTitle('🃏 NATURAL BLACKJACK!')
        .setDescription(`**Your hand:** ${handStr(ph)} = **21**\n\n🎉 Won ${fmt(win)} (2.5×)\n💰 Balance: ${fmt(newBal)}`)],
    });
  }
  return i.reply({
    embeds: [bjEmbed(ph, dh, bet, 'Your turn! Hit, Stand, or Double Down.')],
    components: [bjRow(i.user.id, true)],
  });
}

async function handleButton(i) {
  const p = i.customId.split('_');
  if (p[0] !== 'bj') return;
  const action = p[1], userId = p[2];
  const state  = bjGames.get(userId);
  if (!state) return i.reply({ content: 'No active game.', flags: MessageFlags.Ephemeral });
  if (i.user.id !== userId) return i.reply({ content: "This isn't your game!", flags: MessageFlags.Ephemeral });
  await i.deferUpdate();
  if (action === 'double') {
    const u = await getUser(userId, i.user.username);
    if (u.balance >= state.bet) { await dbRemoveCoins(userId, state.bet); state.bet *= 2; }
  }
  if (action === 'hit' || action === 'double') {
    state.ph.push(drawCard(state.deck));
    const v = handValue(state.ph);
    if (v > 21) {
      bjGames.delete(userId);
      const newBal = (await getUser(userId)).balance;
      return i.editReply({
        embeds: [new EmbedBuilder().setColor(0xff4444).setTitle('🃏 BUST!')
          .setDescription(`**Your hand:** ${handStr(state.ph)} = **${v}** — BUST!\n❌ Lost ${fmt(state.bet)}\n💰 Balance: ${fmt(newBal)}`)],
        components: [],
      });
    }
    if (v === 21 || action === 'double') return resolveDealer(i, userId, state);
    return i.editReply({
      embeds: [bjEmbed(state.ph, state.dh, state.bet, `Your total: **${v}**. Continue?`)],
      components: [bjRow(userId, false)],
    });
  }
  if (action === 'stand') return resolveDealer(i, userId, state);
}

async function resolveDealer(i, userId, state) {
  while (handValue(state.dh) < 17) state.dh.push(drawCard(state.deck));
  const pv = handValue(state.ph), dv = handValue(state.dh);
  let result, color, payout = 0;
  if (dv > 21 || pv > dv) {
    payout = state.bet * 2; result = `🏆 **You Win!** Dealer: ${dv}. Won ${fmt(payout)}!`; color = 0x00ff88;
  } else if (pv === dv) {
    payout = state.bet; result = '🤝 **Push!** Bet returned.'; color = 0xffaa00;
  } else {
    result = `😞 **Dealer wins** (${dv}). Lost ${fmt(state.bet)}.`; color = 0xff4444;
  }
  if (payout > 0) await dbAddCoins(userId, i.user.username, payout);
  bjGames.delete(userId);
  const newBal = (await getUser(userId)).balance;
  return i.editReply({
    embeds: [new EmbedBuilder().setColor(color).setTitle('🃏 Blackjack — Result')
      .setDescription(`**Your hand:** ${handStr(state.ph)} = **${pv}**\n**Dealer:** ${handStr(state.dh)} = **${dv}**\n\n${result}\n💰 Balance: ${fmt(newBal)}`)],
    components: [],
  });
}

function bjRow(uid, showDouble) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj_hit_${uid}`).setLabel('Hit').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj_stand_${uid}`).setLabel('Stand').setStyle(ButtonStyle.Danger)
  );
  if (showDouble) row.addComponents(
    new ButtonBuilder().setCustomId(`bj_double_${uid}`).setLabel('Double Down').setStyle(ButtonStyle.Primary)
  );
  return row;
}
function bjEmbed(ph, dh, bet, status) {
  return new EmbedBuilder().setColor(0x1a1a2e).setTitle('🃏 Blackjack')
    .setDescription(`**Your hand:** ${handStr(ph)} = **${handValue(ph)}**\n**Dealer shows:** ${dh[0].display} | 🂠\n\n**Bet:** ${fmt(bet)}\n\n${status}`);
}

// ══════════════════════════════════════════════════════════════════
//  SHOP & INVENTORY
// ══════════════════════════════════════════════════════════════════
async function cmdShop(i) {
  const extras = await dbGetShopItems();
  const embed  = new EmbedBuilder().setColor(0x00b4ff)
    .setTitle(`${ROBUX} LEN Coin Shop — Robux Packages`)
    .setDescription(`**Rate: ${COIN} 100 LEN Coins = ${ROBUX} 25 Robux**\n\u200B`);
  SHOP_PACKAGES.forEach(p => {
    embed.addFields({
      name:   `${ROBUX} ${p.name}`,
      value:  `${COIN} **${p.coins.toLocaleString()} LEN** → ${ROBUX} **${p.robux} Robux**\n\`/buy ${p.name}\``,
      inline: true,
    });
  });
  if (extras.length) {
    embed.addFields({ name: '\u200B', value: '**— Extra Items —**' });
    extras.forEach(it => {
      const stock = it.stock === -1 ? '∞' : it.stock === 0 ? '❌ Out of stock' : `${it.stock} left`;
      embed.addFields({ name: `${it.emoji || '📦'} ${it.name} — ${fmt(it.price)}`, value: `${it.description}\nStock: ${stock}\n\`/buy ${it.name}\``, inline: true });
    });
  }
  embed.setFooter({ text: 'Contact staff after purchase to receive your Robux' });
  return i.reply({ embeds: [embed] });
}

async function cmdBuy(i) {
  if (!await guardDebt(i)) return;
  const input = i.options.getString('item').toLowerCase().trim();
  const pkg   = SHOP_PACKAGES.find(p => p.name.toLowerCase() === input);
  if (pkg) {
    const user = await getUser(i.user.id, i.user.username);
    if (user.balance < pkg.coins)
      return i.reply({ content: `❌ Need ${fmt(pkg.coins)} — you have ${fmt(user.balance)}.`, flags: MessageFlags.Ephemeral });
    await dbRemoveCoins(i.user.id, pkg.coins);
    await dbAddInventory(i.user.id, `${pkg.name} (${pkg.robux} Robux)`);
    const newBal = (await getUser(i.user.id)).balance;
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('✅ Purchase Successful!')
        .setDescription(
          `Bought **${ROBUX} ${pkg.name}** for ${fmt(pkg.coins)}\n` +
          `You'll receive: **${ROBUX} ${pkg.robux} Robux**\n\n` +
          `💰 Balance: ${fmt(newBal)}\n\n> 📩 Contact staff to receive your Robux!\n> Or use \`/use ${pkg.name}\` to submit a request.`
        )],
    });
  }
  const items = await dbGetShopItems();
  const item  = items.find(it => it.name.toLowerCase() === input);
  if (!item) return i.reply({ content: '❌ Package not found. Check `/shop`.', flags: MessageFlags.Ephemeral });
  if (item.stock === 0) return i.reply({ content: '❌ Out of stock!', flags: MessageFlags.Ephemeral });
  const user = await getUser(i.user.id, i.user.username);
  if (user.balance < item.price)
    return i.reply({ content: `❌ Need ${fmt(item.price)} — you have ${fmt(user.balance)}.`, flags: MessageFlags.Ephemeral });
  await dbRemoveCoins(i.user.id, item.price);
  await dbAddInventory(i.user.id, item.name);
  if (item.stock > 0) await dbDecrementStock(item.name);
  const newBal = (await getUser(i.user.id)).balance;
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('✅ Purchase Successful!')
      .setDescription(`Bought **${item.emoji || '📦'} ${item.name}** for ${fmt(item.price)}\n💰 Balance: ${fmt(newBal)}`)],
  });
}

async function cmdInventory(i) {
  const target   = i.options.getUser('user') || i.user;
  const inv      = await dbGetInventory(target.id);
  const userData = await getUser(target.id, target.username);
  const inDebt   = userData.balance < 0;
  if (!inv.length) return i.reply({
    embeds: [new EmbedBuilder().setColor(0x7289da).setTitle(`🎒 ${target.username}'s Inventory`)
      .setDescription('Empty! Use `/shop` to browse Robux packages.')],
  });
  const grouped = {};
  inv.forEach(it => { grouped[it] = (grouped[it] || 0) + 1; });
  const desc = Object.entries(grouped).map(([n, q]) => `• **${n}** × ${q}`).join('\n');
  return i.reply({
    embeds: [new EmbedBuilder().setColor(inDebt ? 0xff0000 : 0x7289da)
      .setTitle(`🎒 ${target.username}'s Inventory${inDebt ? ' 🔒' : ''}`)
      .setDescription(desc + (inDebt ? '\n\n🔒 **Locked — account is in debt. Invite members to recover!**' : ''))
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: `${inv.length} total items${inDebt ? ' • Locked until out of debt' : ''}` })],
  });
}

async function cmdUse(i) {
  if (!await guardDebt(i)) return;
  const input = i.options.getString('item').toLowerCase();
  const inv   = await dbGetInventory(i.user.id);
  const idx   = inv.findIndex(it => it.toLowerCase().includes(input));
  if (idx === -1) return i.reply({ content: "❌ You don't have that item. Check `/inventory`.", flags: MessageFlags.Ephemeral });
  const itemName = inv[idx];
  const modal = new ModalBuilder()
    .setCustomId(`redeem_modal_${i.user.id}_${encodeURIComponent(itemName)}`)
    .setTitle('Robux Redemption Form');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('roblox_username').setLabel('Your Roblox Username')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. Builderman').setRequired(true)
    )
  );
  return i.showModal(modal);
}

async function handleModal(i) {
  if (!i.customId.startsWith('redeem_modal_')) return;
  const parts          = i.customId.split('_');
  const userId         = parts[2];
  const itemName       = decodeURIComponent(parts.slice(3).join('_'));
  if (i.user.id !== userId) return i.reply({ content: "❌ This form isn't for you.", flags: MessageFlags.Ephemeral });
  const robloxUsername = i.fields.getTextInputValue('roblox_username').trim();
  await dbRemoveInventory(userId, itemName);
  const requestId = await dbAddRedeem({ userId, username: i.user.username, itemName, robloxUsername });
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('✅ Redemption Submitted!')
      .setDescription(
        `Your request has been submitted! Staff will process it soon.\n\n` +
        `**Item:** ${itemName}\n**Roblox Username:** \`${robloxUsername}\`\n\n` +
        `**Request ID:** \`#${requestId}\`\n\n> ${ROBUX} You'll receive a DM when your Robux has been sent!`
      )],
    flags: MessageFlags.Ephemeral,
  });
}

async function cmdCheckRedeems(i) {
  if (!await guardAdmin(i)) return;
  const pending = await dbGetPendingRedeems();
  if (!pending.length) return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('✅ No Pending Requests')
      .setDescription('No pending Robux redemptions right now.')], flags: MessageFlags.Ephemeral,
  });
  const embed = new EmbedBuilder().setColor(0x00b4ff).setTitle(`${ROBUX} Pending Redemptions (${pending.length})`);
  pending.forEach(r => {
    embed.addFields({
      name:  `#${r.id} — ${r.itemName}`,
      value: `👤 **Discord:** <@${r.userId}> (${r.username})\n🎮 **Roblox:** \`${r.robloxUsername}\`\n> Use \`/finish-redeem ${r.id}\` to mark as done`,
      inline: false,
    });
  });
  return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function cmdFinishRedeem(i) {
  if (!await guardAdmin(i)) return;
  const requestId = i.options.getInteger('id');
  const request   = await dbGetRedeem(requestId);
  if (!request) return i.reply({ content: `❌ No redemption found with ID **#${requestId}**.`, flags: MessageFlags.Ephemeral });
  if (request.status === 'paid') return i.reply({ content: `❌ Request **#${requestId}** is already done.`, flags: MessageFlags.Ephemeral });
  await dbMarkRedeemDone(requestId, i.user.tag);
  try {
    const user = await client.users.fetch(request.userId);
    await user.send({
      embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle(`${ROBUX} Your Robux Has Been Sent!`)
        .setDescription(
          `Your redemption request has been fulfilled! 🎉\n\n**Item:** ${request.itemName}\n` +
          `**Roblox Username:** \`${request.robloxUsername}\`\n\n` +
          `**Request ID:** \`#${requestId}\`\n**Processed by:** ${i.user.tag}\n\n> Thank you for using the LEN Coin shop!`
        )],
    });
    return i.reply({ embeds: [adminEmbed(`✅ Request **#${requestId}** marked as done!\n\n**User:** <@${request.userId}>\n**Item:** ${request.itemName}\n\n📩 DM sent successfully.`)] });
  } catch {
    return i.reply({ embeds: [adminEmbed(`✅ Request **#${requestId}** marked as done!\n\n**User:** <@${request.userId}>\n**Item:** ${request.itemName}\n\n⚠️ Could not DM — user may have DMs disabled.`)] });
  }
}

// ══════════════════════════════════════════════════════════════════
//  CODES
// ══════════════════════════════════════════════════════════════════
async function getAnnounceChannel(optionChannel) {
  if (optionChannel) return optionChannel;
  const defaultId = await dbGetCodeChannel();
  if (defaultId) return client.channels.fetch(defaultId).catch(() => null);
  return null;
}

async function cmdDropCode(i) {
  if (!await guardAdmin(i)) return;
  const code    = i.options.getString('code').toUpperCase().trim();
  const reward  = i.options.getInteger('reward');
  const minutes = i.options.getInteger('minutes');
  const maxUses = i.options.getInteger('max_uses') ?? 0;
  const channel = i.options.getChannel('channel');
  if (await dbGetCode(code)) return i.reply({ content: `❌ Code **${code}** already exists.`, flags: MessageFlags.Ephemeral });
  const expiresAt       = minutes > 0 ? Date.now() + minutes * 60 * 1000 : null;
  const announceChannel = await getAnnounceChannel(channel);
  const embed = new EmbedBuilder().setColor(0xffd700).setTitle('🎉 Code Dropped!')
    .setDescription(
      `**Code:** ||\`${code}\`||\n**Reward:** ${fmt(reward)}\n` +
      `${expiresAt ? `⏰ Expires <t:${Math.floor(expiresAt/1000)}:R> — <t:${Math.floor(expiresAt/1000)}:F>` : '⏰ No expiry'}\n` +
      `${maxUses > 0 ? `👥 Max uses: **${maxUses}**` : '👥 Unlimited uses'}\n\n` +
      `Use \`/redeem-code ${code}\` to claim!`
    );
  let announceMessageId = null, announceChannelId = null;
  if (announceChannel) {
    const msg = await announceChannel.send({ embeds: [embed] });
    announceMessageId = msg.id; announceChannelId = announceChannel.id;
  }
  await dbAddCode({ code, reward, maxUses, uses: 0, expiresAt, permanent: false, createdBy: i.user.tag, usedBy: [], expired: false, announceMessageId, announceChannelId });
  if (announceChannel) return i.reply({ content: `✅ Code **${code}** dropped in <#${announceChannel.id}>!`, flags: MessageFlags.Ephemeral });
  return i.reply({ embeds: [embed] });
}

async function cmdMakeCode(i) {
  if (!await guardAdmin(i)) return;
  const code    = i.options.getString('code').toUpperCase().trim();
  const reward  = i.options.getInteger('reward');
  const maxUses = i.options.getInteger('max_uses') ?? 0;
  const channel = i.options.getChannel('channel');
  if (await dbGetCode(code)) return i.reply({ content: `❌ Code **${code}** already exists.`, flags: MessageFlags.Ephemeral });
  const announceChannel = await getAnnounceChannel(channel);
  const embed = new EmbedBuilder().setColor(0x00b4ff).setTitle('📌 Permanent Code Created!')
    .setDescription(
      `**Code:** ||\`${code}\`||\n**Reward:** ${fmt(reward)}\n⏰ Never expires\n` +
      `${maxUses > 0 ? `👥 Max uses: **${maxUses}**` : '👥 Unlimited uses'}\n\n` +
      `Use \`/redeem-code ${code}\` to claim!`
    );
  let announceMessageId = null, announceChannelId = null;
  if (announceChannel) {
    const msg = await announceChannel.send({ embeds: [embed] });
    announceMessageId = msg.id; announceChannelId = announceChannel.id;
  }
  await dbAddCode({ code, reward, maxUses, uses: 0, expiresAt: null, permanent: true, createdBy: i.user.tag, usedBy: [], expired: false, announceMessageId, announceChannelId });
  if (announceChannel) return i.reply({ content: `✅ Permanent code **${code}** created in <#${announceChannel.id}>!`, flags: MessageFlags.Ephemeral });
  return i.reply({ embeds: [embed] });
}

async function cmdRemoveCode(i) {
  if (!await guardAdmin(i)) return;
  const code     = i.options.getString('code').toUpperCase().trim();
  const channel  = i.options.getChannel('channel');
  const existing = await dbGetCode(code);
  if (!existing) return i.reply({ content: `❌ No code **${code}** found.`, flags: MessageFlags.Ephemeral });
  await dbRemoveCode(code);
  const embed = new EmbedBuilder().setColor(0xff4444).setTitle('🗑️ Code Removed')
    .setDescription(`Code **\`${code}\`** has been removed and can no longer be redeemed.\nIt was used **${existing.uses}** time(s).`);
  const announceChannel = await getAnnounceChannel(channel);
  if (announceChannel) { await announceChannel.send({ embeds: [embed] }); return i.reply({ content: `✅ Announced in <#${announceChannel.id}>.`, flags: MessageFlags.Ephemeral }); }
  return i.reply({ embeds: [embed] });
}

async function cmdRedeemCode(i) {
  const code  = i.options.getString('code').toUpperCase().trim();
  const entry = await dbGetCode(code);
  if (!entry)                                           return i.reply({ content: '❌ Invalid code.', flags: MessageFlags.Ephemeral });
  if (entry.expired)                                    return i.reply({ content: '❌ This code has expired.', flags: MessageFlags.Ephemeral });
  if (entry.expiresAt && Date.now() > entry.expiresAt)  return i.reply({ content: '❌ This code has expired.', flags: MessageFlags.Ephemeral });
  if (entry.maxUses > 0 && entry.uses >= entry.maxUses) return i.reply({ content: '❌ This code has reached its maximum uses.', flags: MessageFlags.Ephemeral });
  if (entry.usedBy.includes(i.user.id))                 return i.reply({ content: '❌ You have already redeemed this code.', flags: MessageFlags.Ephemeral });
  await dbRedeemCode(code, i.user.id);
  await dbAddCoins(i.user.id, i.user.username, entry.reward);
  const updated = await dbGetCode(code);
  if (updated && updated.maxUses > 0 && updated.uses >= updated.maxUses) {
    const db = await loadDB();
    db.codes[code].expired = true;
    await saveDB();
    if (updated.announceChannelId && updated.announceMessageId) {
      try {
        const ch  = await client.channels.fetch(updated.announceChannelId);
        const msg = await ch.messages.fetch(updated.announceMessageId);
        const ts  = Math.floor(Date.now() / 1000);
        await msg.edit({ embeds: [new EmbedBuilder().setColor(0x888888).setTitle('❌ Code Expired')
          .setDescription(`~~**Code:** \`${code}\`~~\n**Reward:** ${fmt(entry.reward)}\nExpired: <t:${ts}:F>\n**Total uses:** ${updated.uses}`)] });
      } catch { /* ignore */ }
    }
  }
  const newBal = (await getUser(i.user.id)).balance;
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle('🎉 Code Redeemed!')
      .setDescription(`You redeemed **\`${code}\`**!\n\nYou received ${fmt(entry.reward)}\n💰 New balance: ${fmt(newBal)}`)],
    flags: MessageFlags.Ephemeral,
  });
}

async function cmdCodes(i) {
  if (!await guardAdmin(i)) return;
  const codes  = await dbGetAllCodes();
  const active = codes.filter(c => !c.expired);
  if (!active.length) return i.reply({ content: '📭 No active codes.', flags: MessageFlags.Ephemeral });
  const embed = new EmbedBuilder().setColor(0x7289da).setTitle('🎟️ All Active Codes');
  active.forEach(c => {
    const expiry = c.expiresAt ? `<t:${Math.floor(c.expiresAt/1000)}:R> (<t:${Math.floor(c.expiresAt/1000)}:F>)` : 'Never';
    const uses   = c.maxUses > 0 ? `${c.uses}/${c.maxUses}` : `${c.uses}/∞`;
    embed.addFields({ name: `\`${c.code}\` — ${fmt(c.reward)}`, value: `${c.permanent ? '📌 Permanent' : '⏰ Timed'} • Uses: ${uses} • Expires: ${expiry}\nCreated by: ${c.createdBy}`, inline: false });
  });
  return i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function cmdSetCodeChannel(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel('channel');
  await dbSetCodeChannel(channel.id);
  return i.reply({ embeds: [adminEmbed(`✅ Default code channel set to <#${channel.id}>`)] });
}

// ══════════════════════════════════════════════════════════════════
//  INFO
// ══════════════════════════════════════════════════════════════════
async function cmdUserinfo(i) {
  const target  = i.options.getMember('user') || i.member;
  const user    = target.user;
  const warns   = (await dbGetWarnings(user.id)).length;
  const balance = (await getUser(user.id, user.username)).balance;
  const roles   = target.roles.cache.filter(r => r.id !== i.guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None';
  return i.reply({
    embeds: [new EmbedBuilder().setColor(target.displayHexColor || 0x7289da).setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🪪 ID',      value: user.id,     inline: true },
        { name: '💰 Balance', value: fmt(balance), inline: true },
        { name: '⚠️ Warns',  value: `${warns}`,   inline: true },
        { name: `🎭 Roles (${target.roles.cache.size - 1})`, value: roles.length > 1024 ? 'Too many to display' : roles, inline: false },
      )],
  });
}

async function cmdServerinfo(i) {
  const g = i.guild; await g.fetch();
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x7289da).setTitle(`🏠 ${g.name}`).setThumbnail(g.iconURL())
      .addFields(
        { name: '🪪 ID',       value: g.id,                                                            inline: true },
        { name: '👑 Owner',    value: `<@${g.ownerId}>`,                                              inline: true },
        { name: '👥 Members',  value: g.memberCount.toLocaleString(),                                 inline: true },
        { name: '💬 Channels', value: g.channels.cache.size.toLocaleString(),                         inline: true },
        { name: '🎭 Roles',    value: g.roles.cache.size.toLocaleString(),                            inline: true },
        { name: '😀 Emojis',   value: g.emojis.cache.size.toLocaleString(),                           inline: true },
        { name: '💎 Boost',    value: `Tier ${g.premiumTier} (${g.premiumSubscriptionCount} boosts)`, inline: true },
      )],
  });
}

// ══════════════════════════════════════════════════════════════════
//  STOCK
// ══════════════════════════════════════════════════════════════════
async function cmdShowStock(i) {
  if (!await guardAdmin(i)) return;
  const channel  = i.options.getChannel('channel');
  const amount   = i.options.getInteger('amount');
  const embed    = buildStockEmbed(amount, i.user);
  const existing = await dbGetStockMsg(channel.id);
  if (existing) {
    try {
      const msg = await channel.messages.fetch(existing);
      await msg.edit({ embeds: [embed] });
      return i.reply({ content: `✅ Stock updated in <#${channel.id}> → **${amount.toLocaleString()} R$**`, flags: MessageFlags.Ephemeral });
    } catch { /* post fresh */ }
  }
  const msg = await channel.send({ embeds: [embed] });
  await dbSetStockMsg(channel.id, msg.id);
  return i.reply({ content: `✅ Stock embed posted in <#${channel.id}> → **${amount.toLocaleString()} R$**`, flags: MessageFlags.Ephemeral });
}

async function cmdSetStock(i) {
  if (!await guardAdmin(i)) return;
  const channel  = i.options.getChannel('channel');
  const amount   = i.options.getInteger('amount');
  const existing = await dbGetStockMsg(channel.id);
  if (!existing) return i.reply({ content: `❌ No stock embed in <#${channel.id}>. Use \`/show-stock\` first.`, flags: MessageFlags.Ephemeral });
  try {
    const msg = await channel.messages.fetch(existing);
    await msg.edit({ embeds: [buildStockEmbed(amount, i.user)] });
    return i.reply({ content: `✅ Stock updated → **${amount.toLocaleString()} R$** in <#${channel.id}>`, flags: MessageFlags.Ephemeral });
  } catch {
    await dbSetStockMsg(channel.id, null);
    return i.reply({ content: `❌ Embed not found. Use \`/show-stock\` to post a new one.`, flags: MessageFlags.Ephemeral });
  }
}

function buildStockEmbed(amount, updatedBy) {
  const oos    = amount === 0;
  const low    = amount > 0 && amount < 100;
  const color  = oos ? 0xff4444 : low ? 0xffaa00 : 0x00e676;
  const status = oos ? '🔴 **OUT OF STOCK**' : low ? '🟡 **LOW STOCK**' : '🟢 **IN STOCK**';
  return new EmbedBuilder().setColor(color).setTitle('STOCK')
    .setDescription(`${status}\n\u200B`)
    .addFields(
      { name: `${ROBUX} ROBUX`, value: `\`\`\`\n${amount.toLocaleString()} R$\n\`\`\``, inline: false },
      { name: '💱 Rate',        value: `${COIN} **100 LEN = ${ROBUX} 25 Robux**`,        inline: true },
      { name: '🛒 How to Buy',  value: '`/shop` then `/buy <package>`',                  inline: true },
    )
    .setFooter({ text: `Last updated by ${updatedBy?.username ?? 'Admin'} • LEN Coin Store` });
}

// ══════════════════════════════════════════════════════════════════
//  ECONOMY ADMIN
// ══════════════════════════════════════════════════════════════════
async function cmdGiveCoin(i) {
  if (!await guardOwner(i)) return;
  const target = i.options.getUser('user');
  const amount = i.options.getInteger('amount');
  await dbAddCoins(target.id, target.username, amount);
  const newBal = (await getUser(target.id)).balance;
  return i.reply({ embeds: [adminEmbed(`✅ Added ${fmt(amount)} to **${target.username}**\nNew balance: ${fmt(newBal)}`)] });
}

async function cmdRemoveCoin(i) {
  if (!await guardOwner(i)) return;
  const target = i.options.getUser('user');
  const amount = i.options.getInteger('amount');
  await dbRemoveCoins(target.id, amount);
  const newBal = (await getUser(target.id)).balance;
  return i.reply({ embeds: [adminEmbed(`✅ Removed ${fmt(amount)} from **${target.username}**\nNew balance: ${fmt(newBal)}`)] });
}

async function cmdSetCoins(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser('user');
  const amount = i.options.getInteger('amount');
  await dbSetCoins(target.id, target.username, amount);
  return i.reply({ embeds: [adminEmbed(`✅ Set **${target.username}**'s balance to ${fmt(amount)}`)] });
}

async function cmdResetDaily(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser('user');
  await dbSetLastDaily(target.id, 0);
  return i.reply({ embeds: [adminEmbed(`✅ Reset daily for **${target.username}**`)] });
}

// ══════════════════════════════════════════════════════════════════
//  SHOP ADMIN
// ══════════════════════════════════════════════════════════════════
async function cmdAddItem(i) {
  if (!await guardAdmin(i)) return;
  const item = {
    name: i.options.getString('name'), price: i.options.getInteger('price'),
    description: i.options.getString('description'),
    emoji: i.options.getString('emoji') || '📦',
    stock: i.options.getInteger('stock') ?? -1,
  };
  await dbAddShopItem(item);
  return i.reply({ embeds: [adminEmbed(`✅ Added **${item.emoji} ${item.name}** — ${fmt(item.price)} (Stock: ${item.stock === -1 ? '∞' : item.stock})`)] });
}

async function cmdRemoveItem(i) {
  if (!await guardAdmin(i)) return;
  const name = i.options.getString('name');
  const ok   = await dbRemoveShopItem(name);
  if (!ok) return i.reply({ content: '❌ Item not found.', flags: MessageFlags.Ephemeral });
  return i.reply({ embeds: [adminEmbed(`✅ Removed **${name}** from the shop`)] });
}

async function cmdGiveItem(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser('user');
  const item   = i.options.getString('item');
  await dbAddInventory(target.id, item);
  return i.reply({ embeds: [adminEmbed(`✅ Gave **${item}** to **${target.username}**`)] });
}

async function cmdClearInventory(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser('user');
  await dbClearInventory(target.id);
  return i.reply({ embeds: [adminEmbed(`✅ Cleared **${target.username}**'s inventory`)] });
}

// ══════════════════════════════════════════════════════════════════
//  MODERATION
// ══════════════════════════════════════════════════════════════════
async function cmdWarn(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser('user');
  const reason = i.options.getString('reason');
  const count  = await dbAddWarning(target.id, target.username, reason, i.user.tag);
  try {
    await target.send({ embeds: [new EmbedBuilder().setColor(0xffaa00)
      .setTitle(`⚠️ You have been warned in ${i.guild.name}`)
      .addFields({ name: 'Reason', value: reason, inline: false }, { name: 'Warned by', value: i.user.tag, inline: true }, { name: 'Total Warnings', value: `${count}`, inline: true })] });
  } catch { /* DMs closed */ }
  return i.reply({ embeds: [modEmbed('⚠️ User Warned', `**User:** ${target.tag}\n**Reason:** ${reason}\n**Total:** ${count}\n**By:** ${i.user.tag}`, 0xffaa00)] });
}

async function cmdWarnings(i) {
  if (!await guardAdmin(i)) return;
  const target   = i.options.getUser('user');
  const warnings = await dbGetWarnings(target.id);
  if (!warnings.length) return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle(`⚠️ ${target.username}'s Warnings`).setDescription('No warnings on record.')],
  });
  const desc = warnings.map((w, idx) => `**${idx + 1}.** ${w.reason}\n> By ${w.by}`).join('\n\n');
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0xffaa00).setTitle(`⚠️ ${target.username}'s Warnings (${warnings.length})`).setDescription(desc).setThumbnail(target.displayAvatarURL())],
  });
}

async function cmdClearWarnings(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser('user');
  await dbClearWarnings(target.id);
  return i.reply({ embeds: [adminEmbed(`✅ Cleared all warnings for **${target.username}**`)] });
}

async function cmdTimeout(i) {
  if (!await guardAdmin(i)) return;
  const target  = i.options.getMember('user');
  const minutes = i.options.getInteger('minutes');
  const reason  = i.options.getString('reason') || 'No reason provided';
  if (!target) return i.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
  if (target.id === i.user.id) return i.reply({ content: "❌ Can't timeout yourself.", flags: MessageFlags.Ephemeral });
  if (!target.moderatable) return i.reply({ content: '❌ I cannot timeout this user.', flags: MessageFlags.Ephemeral });
  await target.timeout(minutes * 60 * 1000, reason);
  const unmuteTs = Math.floor((Date.now() + minutes * 60 * 1000) / 1000);
  return i.reply({ embeds: [modEmbed('🔇 User Timed Out', `**User:** ${target.user.tag}\n**Duration:** ${minutes} minute(s)\n**Expires:** <t:${unmuteTs}:R> — <t:${unmuteTs}:F>\n**Reason:** ${reason}\n**By:** ${i.user.tag}`, 0xff8800)] });
}

async function cmdUntimeout(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getMember('user');
  if (!target) return i.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
  await target.timeout(null);
  return i.reply({ embeds: [modEmbed('🔊 Timeout Removed', `**User:** ${target.user.tag}\n**By:** ${i.user.tag}`, 0x00ff88)] });
}

async function cmdKick(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getMember('user');
  const reason = i.options.getString('reason') || 'No reason provided';
  if (!target) return i.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
  if (!target.kickable) return i.reply({ content: "❌ I can't kick this user.", flags: MessageFlags.Ephemeral });
  try { await target.user.send({ embeds: [new EmbedBuilder().setColor(0xff4444).setTitle(`👢 You were kicked from ${i.guild.name}`).setDescription(`**Reason:** ${reason}`)] }); } catch { /* DMs closed */ }
  await target.kick(reason);
  return i.reply({ embeds: [modEmbed('👢 User Kicked', `**User:** ${target.user.tag}\n**Reason:** ${reason}\n**By:** ${i.user.tag}`, 0xff4444)] });
}

async function cmdBan(i) {
  if (!await guardAdmin(i)) return;
  const target  = i.options.getMember('user');
  const reason  = i.options.getString('reason') || 'No reason provided';
  const delDays = i.options.getInteger('delete_days') ?? 0;
  if (!target) return i.reply({ content: '❌ User not found.', flags: MessageFlags.Ephemeral });
  if (!target.bannable) return i.reply({ content: "❌ I can't ban this user.", flags: MessageFlags.Ephemeral });
  try { await target.user.send({ embeds: [new EmbedBuilder().setColor(0xff0000).setTitle(`🔨 You were banned from ${i.guild.name}`).setDescription(`**Reason:** ${reason}`)] }); } catch { /* DMs closed */ }
  await target.ban({ reason, deleteMessageDays: delDays });
  return i.reply({ embeds: [modEmbed('🔨 User Banned', `**User:** ${target.user.tag}\n**Reason:** ${reason}\n**Msgs deleted:** ${delDays}d\n**By:** ${i.user.tag}`, 0xff0000)] });
}

async function cmdUnban(i) {
  if (!await guardAdmin(i)) return;
  const userId = i.options.getString('userid');
  const reason = i.options.getString('reason') || 'No reason provided';
  try {
    await i.guild.members.unban(userId, reason);
    return i.reply({ embeds: [modEmbed('✅ User Unbanned', `**User ID:** ${userId}\n**Reason:** ${reason}\n**By:** ${i.user.tag}`, 0x00ff88)] });
  } catch { return i.reply({ content: "❌ Couldn't unban — invalid ID or user isn't banned.", flags: MessageFlags.Ephemeral }); }
}

async function cmdPurge(i) {
  if (!await guardAdmin(i)) return;
  const amount = i.options.getInteger('amount');
  const filter = i.options.getUser('user');
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  let messages = await i.channel.messages.fetch({ limit: 100 });
  if (filter) messages = messages.filter(m => m.author.id === filter.id);
  const toDelete = [...messages.values()].slice(0, amount).filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
  const deleted  = await i.channel.bulkDelete(toDelete, true);
  return i.editReply({ content: `🗑️ Deleted **${deleted.size}** message(s).` });
}

async function cmdSlowmode(i) {
  if (!await guardAdmin(i)) return;
  const seconds = i.options.getInteger('seconds');
  const channel = i.options.getChannel('channel') || i.channel;
  await channel.setRateLimitPerUser(seconds);
  return i.reply({ embeds: [adminEmbed(`⏱️ Slowmode ${seconds === 0 ? '**disabled**' : `set to **${seconds}s**`} in <#${channel.id}>`)] });
}

async function cmdLock(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel('channel') || i.channel;
  const reason  = i.options.getString('reason') || 'No reason provided';
  await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
  return i.reply({ embeds: [modEmbed('🔒 Channel Locked', `<#${channel.id}> locked.\n**Reason:** ${reason}`, 0xff4444)] });
}

async function cmdUnlock(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel('channel') || i.channel;
  await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null });
  return i.reply({ embeds: [modEmbed('🔓 Channel Unlocked', `<#${channel.id}> is now open.`, 0x00ff88)] });
}

async function cmdAnnounce(i) {
  if (!await guardAdmin(i)) return;
  const channel  = i.options.getChannel('channel');
  const title    = i.options.getString('title');
  const message  = i.options.getString('message');
  const colorHex = i.options.getString('color');
  let color = 0x5865f2;
  if (colorHex) { const p = parseInt(colorHex.replace('#', ''), 16); if (!isNaN(p)) color = p; }
  await channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(`📢 ${title}`).setDescription(message).setFooter({ text: `Announced by ${i.user.username}` })] });
  return i.reply({ content: `✅ Announcement sent to <#${channel.id}>`, flags: MessageFlags.Ephemeral });
}

// ══════════════════════════════════════════════════════════════════
//  HELP
// ══════════════════════════════════════════════════════════════════
async function cmdHelp(i) {
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2)
      .setTitle(`${COIN} LEN Coin Bot — Commands`)
      .setDescription('Here\'s everything you can do!\n\u200B')
      .addFields(
        { name: '💰 Economy', inline: false, value: ['`/balance [user]` — Check balance', '`/daily` — Claim 100 free LEN every 24h', '`/pay <user> <amount>` — Send coins (Verified role required)', '`/leaderboard` — Top 10 richest users'].join('\n') },
        { name: '🎰 Gambling', inline: false, value: ['`/coinflip <heads|tails> <bet>` — 50/50, win 2×', '`/slots <bet>` — Spin the slots (up to 20× jackpot!)', '`/blackjack <bet>` — Hit, Stand or Double Down'].join('\n') },
        { name: `${ROBUX} Shop`, inline: false, value: ['`/shop` — Browse Robux packages', '`/buy <package>` — Buy a package (Robux S/M/L/XL/XXL)', '`/inventory [user]` — View your items', '`/use <item>` — Redeem an item (enter Roblox username)'].join('\n') },
        { name: '🎟️ Codes', inline: false, value: ['`/redeem-code <code>` — Redeem a code for LEN Coins'].join('\n') },
        { name: 'ℹ️ Info', inline: false, value: ['`/userinfo [user]` — View user info', '`/serverinfo` — View server stats', '`/help` — This menu', '`/tutorial` — Full beginner guide'].join('\n') },
      )
      .setFooter({ text: '1 message = 1 LEN Coin • 100 LEN = 25 Robux' })],
  });
}

async function cmdAdminHelp(i) {
  if (!await guardAdmin(i)) return;
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0xff4444)
      .setTitle('🔧 Admin Commands')
      .setDescription('Requires **Admin Perm** role or **Administrator** permission.\n\u200B')
      .addFields(
        { name: `${ROBUX} Stock`, inline: false, value: ['`/show-stock <channel> <amount>` — Post stock embed', '`/set-stock <channel> <amount>` — Update stock embed'].join('\n') },
        { name: '🎟️ Codes', inline: false, value: ['`/drop-code <code> <reward> <minutes>` — Drop timed code', '`/make-code <code> <reward>` — Permanent code', '`/remove-code <code>` — Delete a code', '`/codes` — View all active codes', '`/set-code-channel <channel>` — Default announce channel'].join('\n') },
        { name: '💰 Economy', inline: false, value: ['`/givecoin <user> <amount>` — Add coins [Owner/Co-Owner]', '`/removecoin <user> <amount>` — Remove coins [Owner/Co-Owner]', '`/setcoins <user> <amount>` — Set exact balance', '`/resetdaily <user>` — Reset daily cooldown'].join('\n') },
        { name: '🛒 Shop', inline: false, value: ['`/additem <name> <price> <desc>` — Add shop item', '`/removeitem <name>` — Remove shop item', '`/giveitem <user> <item>` — Give item directly', '`/clearinventory <user>` — Wipe inventory'].join('\n') },
        { name: '📋 Redemptions', inline: false, value: ['`/check-redeems` — View pending Robux redemptions', '`/finish-redeem <id>` — Mark done & DM user'].join('\n') },
        { name: '🔨 Moderation', inline: false, value: ['`/warn` `/warnings` `/clearwarnings`', '`/timeout` `/untimeout`', '`/kick` `/ban` `/unban`', '`/purge` `/slowmode` `/lock` `/unlock` `/announce`'].join('\n') },
      )
      .setFooter({ text: 'Admin Perm role or Administrator permission required' })],
    flags: MessageFlags.Ephemeral,
  });
}

async function cmdTutorial(i) {
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x5865f2)
      .setTitle('📖 Bot Tutorial — Getting Started')
      .setDescription('Welcome! Here\'s everything you need to know.\n\u200B')
      .addFields(
        { name: `${COIN} Step 1 — Earn LEN Coins`, inline: false, value: 'Send messages in any channel — every message gives you **1 LEN Coin** automatically.\nUse `/daily` once every 24h to claim **100 free LEN Coins**.\nCheck your balance with `/balance` anytime.' },
        { name: `${ROBUX} Step 2 — Buy Robux`, inline: false, value: 'Use `/shop` to see all Robux packages.\nRate: **100 LEN Coins = 25 Robux**\nOnce you have enough, use `/buy <package name>` to purchase.\nYour purchase goes to your `/inventory`.' },
        { name: '📦 Step 3 — Redeem Your Robux', inline: false, value: 'Use `/use <item name>` to redeem from your inventory.\nA form will ask for your **Roblox Username**.\nSubmit it — staff will process your request and DM you when your Robux is sent!' },
        { name: '🎰 Step 4 — Gambling (Optional)', inline: false, value: '`/coinflip <heads|tails> <bet>` — 50/50 double or lose\n`/slots <bet>` — Spin for up to **20× jackpot**\n`/blackjack <bet>` — Hit, Stand, Double Down\n⚠️ Only bet what you can afford to lose!' },
        { name: '🎟️ Step 5 — Codes', inline: false, value: 'Staff sometimes drop codes in the server.\nUse `/redeem-code <code>` to claim free LEN Coins.\nEach code can only be redeemed **once per person**.' },
        { name: '📊 Other Useful Commands', inline: false, value: '`/leaderboard` — Top 10 richest users\n`/userinfo [user]` — View info about yourself or someone\n`/serverinfo` — Server stats\n`/help` — Full command list' },
      )
      .setFooter({ text: 'Need help? Ask a staff member!' })],
  });
}

async function cmdAdminTutorial(i) {
  return i.reply({
    embeds: [new EmbedBuilder().setColor(0xff4444)
      .setTitle('🔧 Admin Setup Tutorial')
      .setDescription('How to set up roles and use admin commands.\n\u200B')
      .addFields(
        { name: '👑 Step 1 — Create the Admin Role', inline: false, value: '1. Go to **Server Settings → Roles**\n2. Click **"Create Role"**\n3. Name it exactly: **`Admin Perm`**\n> ⚠️ Must be exactly `Admin Perm` (case-insensitive)\n4. Assign it to your staff members' },
        { name: '👤 Step 2 — Owner / Co-Owner Role', inline: false, value: 'Create a role named **`Owner`** or **`Co Owner`** (or `Co-Owner`).\nMembers with this role can use `/givecoin` and `/removecoin`.' },
        { name: '✅ Step 3 — Verified Role', inline: false, value: 'Create a role named **`Verified`**.\nOnly members with this role can use `/pay` to send coins to others.' },
        { name: '📡 Step 4 — Set Up Code Channel', inline: false, value: 'Use `/set-code-channel <#channel>` to set a default channel for code drops.\nAll `/drop-code` and `/make-code` announcements will go there by default.' },
        { name: '📬 Step 5 — Processing Redemptions', inline: false, value: 'When a user uses `/use <item>`, they fill in their Roblox username.\nUse `/check-redeems` to see all pending requests.\nSend the Robux in-game, then `/finish-redeem <id>` to mark as done.\nThe bot will **DM the user** automatically.' },
        { name: '📢 Other Admin Commands', inline: false, value: '`/announce <#channel> <title> <message>` — Send announcement\n`/show-stock <#channel> <amount>` — Post live stock embed\n`/adminhelp` — Full list of every admin command' },
      )
      .setFooter({ text: 'Role names are case-insensitive • Admin Perm | Owner | Co Owner | Verified' })],
    flags: MessageFlags.Ephemeral,
  });
}

async function cmdOwnerTutorial(i) {
  if (i.user.username.toLowerCase() !== 'kosai06913') {
    return i.reply({ content: '❌ This command is only available to the bot owner.', flags: MessageFlags.Ephemeral });
  }
  const pages = [
    new EmbedBuilder().setColor(0xffd700).setTitle('📖 Full Bot Guide — Page 1/5 — Roles & Permissions')
      .addFields(
        { name: '👑 Owner / Co-Owner', inline: false, value: 'Role named **`Owner`** or **`Co Owner`** / **`Co-Owner`**\n• `/givecoin` — Add coins to anyone\n• `/removecoin` — Remove coins from anyone' },
        { name: '🔧 Admin Perm', inline: false, value: 'Role named **`Admin Perm`** (case-insensitive)\nOR Discord **Administrator** permission\nGives access to ALL admin commands.' },
        { name: '✅ Verified', inline: false, value: 'Role named **`Verified`**\nRequired to use `/pay` to send coins to others.' },
        { name: '⚠️ Role Name Rules', inline: false, value: '• `Admin Perm` → all admin commands\n• `Owner` → givecoin / removecoin\n• `Co Owner` or `Co-Owner` → givecoin / removecoin\n• `Verified` → /pay' },
      ).setFooter({ text: 'Page 1/5' }),

    new EmbedBuilder().setColor(0x00b4ff).setTitle('📖 Full Bot Guide — Page 2/5 — Economy & Coins')
      .addFields(
        { name: `${COIN} How Coins Are Earned`, inline: false, value: '**Messages:** Every message = **1 LEN Coin** (no cooldown)\n**Daily:** `/daily` = **100 LEN Coins** every 24h (shows Discord timestamp for next claim)\n**Codes:** `/redeem-code` claims staff-dropped codes\n**Invites:** Inviting a new member = **+100 LEN Coins** to inviter\n**Admin:** `/givecoin` adds coins directly (Owner/Co-Owner only)' },
        { name: '📉 Invite Leave Penalty', inline: false, value: 'When a member you invited leaves, you **lose 100 LEN Coins** (can go negative).\nIf balance goes negative, shop/gambling/inventory is **locked** until recovered.\nRejoins are detected — no coins awarded for people who already joined before.' },
        { name: '💾 Data Storage', inline: false, value: 'All data saved to **JSONBin.io**\nRailway env vars needed:\n• `JSONBIN_BIN_ID`\n• `JSONBIN_API_KEY`\n• `DISCORD_TOKEN`\n• `CLIENT_ID`' },
      ).setFooter({ text: 'Page 2/5' }),

    new EmbedBuilder().setColor(0x00ff88).setTitle(`📖 Full Bot Guide — Page 3/5 — ${ROBUX} Shop & Redemptions`)
      .addFields(
        { name: 'Default Robux Packages', inline: false, value: `Rate: **100 LEN = 25 Robux**\n• **Robux S** — 100 LEN → 25 R$\n• **Robux M** — 300 LEN → 75 R$\n• **Robux L** — 700 LEN → 175 R$\n• **Robux XL** — 1,500 LEN → 375 R$\n• **Robux XXL** — 3,000 LEN → 750 R$` },
        { name: '📬 Redemption Flow', inline: false, value: '1. User buys package → inventory\n2. User runs `/use <item>`\n3. Modal pops up asking for **Roblox Username**\n4. Request saved with an ID\n5. Admin runs `/check-redeems` to see pending\n6. Send Robux in-game\n7. Admin runs `/finish-redeem <id>` → bot **DMs user** confirmation' },
      ).setFooter({ text: 'Page 3/5' }),

    new EmbedBuilder().setColor(0xffd700).setTitle('📖 Full Bot Guide — Page 4/5 — Codes System')
      .addFields(
        { name: '🎟️ How Codes Work', inline: false, value: 'Each user can only redeem a code **once**.\nExpired codes auto-update their announcement message to show ❌ Expired.\nExpiry checker runs every **30 seconds**.' },
        { name: '⏰ /drop-code', inline: false, value: '`/drop-code <code> <reward> <minutes> [channel] [max_uses]`\nDrops a timed code. `minutes=0` = never expires.\nCode shown as spoiler `||CODE||` in announcement.' },
        { name: '📌 /make-code', inline: false, value: '`/make-code <code> <reward> [channel] [max_uses]`\nPermanent code — never expires by time.\nStill expires if max_uses is hit.' },
        { name: '🗑️ /remove-code', inline: false, value: '`/remove-code <code> [channel]`\nDeletes the code immediately. Optionally announces removal.' },
        { name: '📡 Default Channel', inline: false, value: '`/set-code-channel <#channel>` — Default for all code announcements.\n`/codes` — Lists all currently active codes.' },
      ).setFooter({ text: 'Page 4/5' }),

    new EmbedBuilder().setColor(0xff4444).setTitle('📖 Full Bot Guide — Page 5/5 — Moderation & Setup')
      .addFields(
        { name: '🔨 Moderation Commands', inline: false, value: '`/warn` — Warn + DM the user\n`/warnings` `/clearwarnings`\n`/timeout <user> <minutes>` — Mute (shows Discord timestamp)\n`/untimeout` — Remove mute\n`/kick` `/ban` `/unban` — DMs user before action\n`/purge <amount> [user]` — Bulk delete\n`/slowmode <seconds>` — Set channel slowmode\n`/lock` `/unlock` — Channel send permissions\n`/announce <#ch> <title> <msg>` — Formatted embed' },
        { name: '⚙️ Railway Env Vars', inline: false, value: '`DISCORD_TOKEN` — Bot token\n`CLIENT_ID` — Application ID\n`JSONBIN_BIN_ID` — JSONBin bin ID\n`JSONBIN_API_KEY` — JSONBin master key' },
        { name: '📖 Help Commands', inline: false, value: '`/help` — User command list\n`/adminhelp` — Admin command list (Admin Perm)\n`/tutorial` — Beginner guide (everyone)\n`/admin-tutorial` — Role setup guide (ephemeral)\n`/owner-tutorial` — This guide (you only)' },
      ).setFooter({ text: 'Page 5/5 — You know everything now! 🎉' }),
  ];

  await i.reply({ embeds: [pages[0]], flags: MessageFlags.Ephemeral });
  for (let idx = 1; idx < pages.length; idx++) {
    await i.followUp({ embeds: [pages[idx]], flags: MessageFlags.Ephemeral });
  }
}

// ══════════════════════════════════════════════════════════════════
//  EMBED HELPERS
// ══════════════════════════════════════════════════════════════════
function adminEmbed(desc) {
  return new EmbedBuilder().setColor(0x7289da).setTitle('🔧 Admin Action').setDescription(desc);
}
function modEmbed(title, desc, color) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
}

// ══════════════════════════════════════════════════════════════════
//  BLACKJACK HELPERS
// ══════════════════════════════════════════════════════════════════
function buildDeck() {
  const suits = ['♠','♥','♦','♣'], ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'], deck = [];
  for (const s of suits) for (const r of ranks)
    deck.push({ display: `${r}${s}`, value: r === 'A' ? 11 : ['J','Q','K'].includes(r) ? 10 : parseInt(r), rank: r });
  for (let n = deck.length - 1; n > 0; n--) { const k = Math.floor(Math.random() * (n + 1)); [deck[n], deck[k]] = [deck[k], deck[n]]; }
  return deck;
}
function drawCard(deck) { return deck.pop(); }
function handValue(h) {
  let t = h.reduce((s, c) => s + c.value, 0), a = h.filter(c => c.rank === 'A').length;
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}
function handStr(h) { return h.map(c => c.display).join(' '); }

// ══════════════════════════════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════════════════════════════
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await loadDB();
  await registerCommands();
  for (const guild of client.guilds.cache.values()) await buildInviteCache(guild);
  client.user.setActivity('LEN Coin Economy | /shop', { type: 3 });
  setInterval(checkCodeExpiry, 30 * 1000);
});

client.login(process.env.DISCORD_TOKEN);
