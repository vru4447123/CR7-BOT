// Railway injects environment variables directly — no dotenv needed
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  REST,
  Routes,
} = require("discord.js");

const Database = require("./database");
const { formatCoins, COIN_EMOJI } = require("./utils");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

const db = new Database();

// ══════════════════════════════════════════════════════════════════════════════
//  PERMISSION GUARD
//  Allows: Administrator permission OR role named "Admin Perm" (case-insensitive)
// ══════════════════════════════════════════════════════════════════════════════
function isAdmin(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return member.roles.cache.some((r) => r.name.toLowerCase() === "admin perm");
}

async function guardAdmin(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("🚫 Access Denied")
          .setDescription(
            "You need the **Admin Perm** role or **Administrator** permission to use this command."
          ),
      ],
      ephemeral: true,
    });
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SLASH COMMAND DEFINITIONS
// ══════════════════════════════════════════════════════════════════════════════
const commands = [
  // ── Economy ────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your LEN Coin balance")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily 100 LEN Coins"),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the richest users on this server"),

  new SlashCommandBuilder()
    .setName("pay")
    .setDescription("Send LEN Coins to another user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Recipient").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount to send")
        .setRequired(true)
        .setMinValue(1)
    ),

  // ── Gambling ───────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin — win 2x or lose your bet")
    .addStringOption((o) =>
      o
        .setName("side")
        .setDescription("heads or tails")
        .setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" }
        )
    )
    .addIntegerOption((o) =>
      o
        .setName("bet")
        .setDescription("Amount to bet")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine!")
    .addIntegerOption((o) =>
      o
        .setName("bet")
        .setDescription("Amount to bet")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of Blackjack!")
    .addIntegerOption((o) =>
      o
        .setName("bet")
        .setDescription("Amount to bet")
        .setRequired(true)
        .setMinValue(1)
    ),

  // ── Shop & Inventory ───────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse the Robux shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy a Robux package")
    .addStringOption((o) =>
      o
        .setName("item")
        .setDescription(
          "Package name (e.g. Robux S, Robux M, Robux L, Robux XL)"
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("use")
    .setDescription("Redeem an item from your inventory — opens a form for your Roblox info")
    .addStringOption((o) =>
      o.setName("item").setDescription("Item name").setRequired(true)
    ),

  // ── Redemption Admin ───────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("check-uses")
    .setDescription("[Admin] View all pending Robux redemption requests"),

  new SlashCommandBuilder()
    .setName("use-done")
    .setDescription("[Admin] Mark a redemption as paid and notify the user")
    .addIntegerOption((o) =>
      o.setName("id").setDescription("Redemption request ID").setRequired(true)
    ),

  // ── Info ───────────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View detailed info about a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View info about this server"),

  // ── Robux Stock (Admin) ────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("show-stock")
    .setDescription("[Admin] Post or update the Robux stock embed in a channel")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Target channel").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("robux")
        .setDescription("Robux amount in stock")
        .setRequired(true)
        .setMinValue(0)
    ),

  new SlashCommandBuilder()
    .setName("set-stock")
    .setDescription(
      "[Admin] Quickly update the Robux stock number (updates existing embed)"
    )
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel the stock embed is in")
        .setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("robux")
        .setDescription("New Robux amount")
        .setRequired(true)
        .setMinValue(0)
    ),

  // ── Economy Admin ──────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("[Admin] Add LEN Coins to a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("[Admin] Remove LEN Coins from a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("setcoins")
    .setDescription("[Admin] Set a user's exact LEN Coin balance")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Amount")
        .setRequired(true)
        .setMinValue(0)
    ),

  new SlashCommandBuilder()
    .setName("resetdaily")
    .setDescription("[Admin] Reset a user's daily cooldown")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("additem")
    .setDescription("[Admin] Add a custom item to the shop")
    .addStringOption((o) =>
      o.setName("name").setDescription("Item name").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("price")
        .setDescription("Price in LEN Coins")
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption((o) =>
      o
        .setName("description")
        .setDescription("Item description")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("emoji").setDescription("Item emoji").setRequired(false)
    )
    .addIntegerOption((o) =>
      o
        .setName("stock")
        .setDescription("Stock quantity (-1 = unlimited)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("removeitem")
    .setDescription("[Admin] Remove a custom item from the shop")
    .addStringOption((o) =>
      o.setName("name").setDescription("Item name").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("giveitem")
    .setDescription("[Admin] Give an item directly to a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("item").setDescription("Item name").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clearinventory")
    .setDescription("[Admin] Clear a user's entire inventory")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    ),

  // ── Moderation ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("[Admin] Timeout a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addIntegerOption((o) =>
      o
        .setName("minutes")
        .setDescription("Duration in minutes (max 40320 = 28 days)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("[Admin] Remove timeout from a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("[Admin] Warn a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("reason")
        .setDescription("Reason for warning")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("[Admin] View a user's warnings")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("[Admin] Clear all warnings for a user")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("[Admin] Kick a user from the server")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("[Admin] Ban a user from the server")
    .addUserOption((o) =>
      o.setName("user").setDescription("Target user").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false)
    )
    .addIntegerOption((o) =>
      o
        .setName("delete_days")
        .setDescription("Delete message history (days, 0-7)")
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(7)
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("[Admin] Unban a user by ID")
    .addStringOption((o) =>
      o.setName("userid").setDescription("User ID to unban").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("[Admin] Delete multiple messages from a channel")
    .addIntegerOption((o) =>
      o
        .setName("amount")
        .setDescription("Number of messages to delete (1-100)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .addUserOption((o) =>
      o
        .setName("user")
        .setDescription("Only delete messages from this user")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("[Admin] Set slowmode in a channel")
    .addIntegerOption((o) =>
      o
        .setName("seconds")
        .setDescription("Slowmode in seconds (0 = off, max 21600)")
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(21600)
    )
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel (defaults to current)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("[Admin] Lock a channel so members can't send messages")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to lock (defaults to current)")
        .setRequired(false)
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Reason").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("[Admin] Unlock a channel")
    .addChannelOption((o) =>
      o
        .setName("channel")
        .setDescription("Channel to unlock (defaults to current)")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("[Admin] Send an announcement embed to a channel")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Target channel").setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("title")
        .setDescription("Announcement title")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("message")
        .setDescription("Announcement message")
        .setRequired(true)
    )
    .addStringOption((o) =>
      o
        .setName("color")
        .setDescription("Embed color hex (e.g. ff0000)")
        .setRequired(false)
    ),
].map((c) => c.toJSON());

// ─── Register Commands ─────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("📡 Clearing old commands and registering fresh...");

    // Step 1: Wipe ALL existing global commands first
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: [],
    });
    console.log("🗑️  Old commands cleared.");

    // Step 2: Register all commands fresh
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log(`✅ ${commands.length} slash commands registered successfully.`);
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
}

// ─── Message Reward — 1 message = 1 LEN Coin, no cooldown ────────────────────
client.on("messageCreate", (msg) => {
  if (msg.author.bot || !msg.guild) return;
  db.addCoins(msg.author.id, msg.author.username, 1);
});

// ─── Interaction Router ────────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) return handleButton(interaction);
  if (interaction.isModalSubmit()) return handleModal(interaction);
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case "balance":        return cmdBalance(interaction);
      case "daily":          return cmdDaily(interaction);
      case "leaderboard":    return cmdLeaderboard(interaction);
      case "pay":            return cmdPay(interaction);
      case "coinflip":       return cmdCoinflip(interaction);
      case "slots":          return cmdSlots(interaction);
      case "blackjack":      return cmdBlackjack(interaction);
      case "shop":           return cmdShop(interaction);
      case "buy":            return cmdBuy(interaction);
      case "inventory":      return cmdInventory(interaction);
      case "use":            return cmdUse(interaction);
      case "check-uses":     return cmdCheckUses(interaction);
      case "use-done":       return cmdUseDone(interaction);
      case "userinfo":       return cmdUserinfo(interaction);
      case "serverinfo":     return cmdServerinfo(interaction);
      case "show-stock":     return cmdShowStock(interaction);
      case "set-stock":      return cmdSetStock(interaction);
      case "addcoins":       return cmdAddCoins(interaction);
      case "removecoins":    return cmdRemoveCoins(interaction);
      case "setcoins":       return cmdSetCoins(interaction);
      case "resetdaily":     return cmdResetDaily(interaction);
      case "additem":        return cmdAddItem(interaction);
      case "removeitem":     return cmdRemoveItem(interaction);
      case "giveitem":       return cmdGiveItem(interaction);
      case "clearinventory": return cmdClearInventory(interaction);
      case "timeout":        return cmdTimeout(interaction);
      case "untimeout":      return cmdUntimeout(interaction);
      case "warn":           return cmdWarn(interaction);
      case "warnings":       return cmdWarnings(interaction);
      case "clearwarnings":  return cmdClearWarnings(interaction);
      case "kick":           return cmdKick(interaction);
      case "ban":            return cmdBan(interaction);
      case "unban":          return cmdUnban(interaction);
      case "purge":          return cmdPurge(interaction);
      case "slowmode":       return cmdSlowmode(interaction);
      case "lock":           return cmdLock(interaction);
      case "unlock":         return cmdUnlock(interaction);
      case "announce":       return cmdAnnounce(interaction);
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const payload = {
      content: "⚠️ Something went wrong. Please try again.",
      ephemeral: true,
    };
    interaction.replied || interaction.deferred
      ? interaction.followUp(payload)
      : interaction.reply(payload);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdBalance(i) {
  const target = i.options.getUser("user") || i.user;
  const data = db.getUser(target.id, target.username);
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${COIN_EMOJI} ${target.username}'s Balance`)
        .setThumbnail(target.displayAvatarURL())
        .setDescription(`**Balance:** ${formatCoins(data.balance)}`)
        .setFooter({ text: "1 message = 1 LEN Coin • 100 LEN = 15 Robux" }),
    ],
  });
}

async function cmdDaily(i) {
  const data = db.getUser(i.user.id, i.user.username);
  const now = Date.now();
  const CD = 24 * 60 * 60 * 1000;

  if (data.lastDaily && now - data.lastDaily < CD) {
    const rem = CD - (now - data.lastDaily);
    const h = Math.floor(rem / 3600000);
    const m = Math.floor((rem % 3600000) / 60000);
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("⏰ Already Claimed")
          .setDescription(`Come back in **${h}h ${m}m**.`),
      ],
      ephemeral: true,
    });
  }

  db.addCoins(i.user.id, i.user.username, 100);
  db.setLastDaily(i.user.id);
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle("🎁 Daily Reward!")
        .setDescription(
          `You received **${formatCoins(100)}**!\nBalance: **${formatCoins(db.getUser(i.user.id).balance)}**`
        )
        .setThumbnail(i.user.displayAvatarURL())
        .setFooter({ text: "Come back in 24 hours!" }),
    ],
  });
}

async function cmdLeaderboard(i) {
  const top = db.getLeaderboard(10);
  const desc =
    top
      .map((u, idx) => {
        const m =
          idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `**${idx + 1}.**`;
        return `${m} <@${u.userId}> — ${formatCoins(u.balance)}`;
      })
      .join("\n") || "No users yet!";
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`${COIN_EMOJI} LEN Coin Leaderboard`)
        .setDescription(desc)
        ,
    ],
  });
}

async function cmdPay(i) {
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  if (target.id === i.user.id)
    return i.reply({ content: "❌ Can't pay yourself!", ephemeral: true });
  if (target.bot)
    return i.reply({ content: "❌ Can't pay bots!", ephemeral: true });
  const sender = db.getUser(i.user.id, i.user.username);
  if (sender.balance < amount)
    return i.reply({
      content: `❌ Insufficient funds. You have **${formatCoins(sender.balance)}**.`,
      ephemeral: true,
    });
  db.removeCoins(i.user.id, amount);
  db.addCoins(target.id, target.username, amount);
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle("💸 Transfer Successful")
        .setDescription(
          `**${i.user.username}** sent **${formatCoins(amount)}** to **${target.username}**`
        ),
    ],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  GAMBLING
// ══════════════════════════════════════════════════════════════════════════════

async function cmdCoinflip(i) {
  const side = i.options.getString("side");
  const bet = i.options.getInteger("bet");
  const user = db.getUser(i.user.id, i.user.username);
  if (user.balance < bet)
    return i.reply({
      content: `❌ You only have **${formatCoins(user.balance)}**.`,
      ephemeral: true,
    });
  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === side;
  won
    ? db.addCoins(i.user.id, i.user.username, bet)
    : db.removeCoins(i.user.id, bet);
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(won ? 0x00ff88 : 0xff4444)
        .setTitle(won ? "<:Coin:1483370941583982612> You Won!" : "<:Coin:1483370941583982612> You Lost!")
        .setDescription(
          `The coin landed on **${result}** ${result === "heads" ? "👑" : "🔵"}\n` +
            `You guessed **${side}**\n\n` +
            (won
              ? `✅ Won **${formatCoins(bet)}**!`
              : `❌ Lost **${formatCoins(bet)}**`) +
            `\n\n💰 Balance: **${formatCoins(db.getUser(i.user.id).balance)}**`
        ),
    ],
  });
}

async function cmdSlots(i) {
  const bet = i.options.getInteger("bet");
  const user = db.getUser(i.user.id, i.user.username);
  if (user.balance < bet)
    return i.reply({
      content: `❌ You only have **${formatCoins(user.balance)}**.`,
      ephemeral: true,
    });

  const symbols = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"];
  const weights = [30, 20, 20, 15, 10, 4, 1];
  function spin() {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let j = 0; j < symbols.length; j++) {
      r -= weights[j];
      if (r <= 0) return symbols[j];
    }
    return symbols[0];
  }

  const reels = [spin(), spin(), spin()];
  let mult = 0,
    resultText = "❌ No match — better luck next time!";
  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    if      (reels[0] === "7️⃣") { mult = 20; resultText = "🎰 **JACKPOT! 7-7-7!** 20×!"; }
    else if (reels[0] === "💎")  { mult = 10; resultText = "💎 **Triple Diamonds!** 10×!"; }
    else if (reels[0] === "⭐")  { mult = 5;  resultText = "⭐ **Triple Stars!** 5×!"; }
    else                          { mult = 3;  resultText = `🎉 **Triple ${reels[0]}!** 3×!`; }
  } else if (
    reels[0] === reels[1] ||
    reels[1] === reels[2] ||
    reels[0] === reels[2]
  ) {
    mult = 1.5;
    resultText = "✨ Two of a kind! 1.5×!";
  }

  let win = 0;
  if (mult > 0) {
    win = Math.floor(bet * mult);
    db.addCoins(i.user.id, i.user.username, win - bet);
  } else {
    db.removeCoins(i.user.id, bet);
  }

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(mult > 0 ? 0xffd700 : 0xff4444)
        .setTitle("🎰 Slot Machine")
        .setDescription(
          `**[ ${reels.join(" | ")} ]**\n\n${resultText}\n\n` +
            (mult > 0
              ? `✅ Won **${formatCoins(win)}** (+${formatCoins(win - bet)})`
              : `❌ Lost **${formatCoins(bet)}**`) +
            `\n💰 Balance: **${formatCoins(db.getUser(i.user.id).balance)}**`
        ),
    ],
  });
}

// ── Blackjack ──────────────────────────────────────────────────────────────────
const bjGames = new Map();

async function cmdBlackjack(i) {
  const bet = i.options.getInteger("bet");
  const user = db.getUser(i.user.id, i.user.username);
  if (user.balance < bet)
    return i.reply({
      content: `❌ You only have **${formatCoins(user.balance)}**.`,
      ephemeral: true,
    });

  const deck = buildDeck();
  const ph = [drawCard(deck), drawCard(deck)];
  const dh = [drawCard(deck), drawCard(deck)];
  bjGames.set(i.user.id, { bet, deck, ph, dh });
  db.removeCoins(i.user.id, bet);

  if (handValue(ph) === 21) {
    const win = Math.floor(bet * 2.5);
    db.addCoins(i.user.id, i.user.username, win);
    bjGames.delete(i.user.id);
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffd700)
          .setTitle("🃏 NATURAL BLACKJACK!")
          .setDescription(
            `**Your hand:** ${handStr(ph)} = **21**\n\n🎉 Won **${formatCoins(win)}** (2.5×)\n💰 Balance: **${formatCoins(db.getUser(i.user.id).balance)}**`
          ),
      ],
    });
  }

  return i.reply({
    embeds: [bjEmbed(ph, dh, bet, "Your turn! Hit, Stand, or Double Down.")],
    components: [bjRow(i.user.id, true)],
  });
}

async function handleButton(i) {
  const p = i.customId.split("_");
  if (p[0] !== "bj") return;
  const action = p[1],
    userId = p[2];
  const state = bjGames.get(userId);
  if (!state)
    return i.reply({ content: "No active game.", ephemeral: true });
  if (i.user.id !== userId)
    return i.reply({ content: "This isn't your game!", ephemeral: true });
  await i.deferUpdate();

  if (action === "double") {
    const u = db.getUser(userId, i.user.username);
    if (u.balance >= state.bet) {
      db.removeCoins(userId, state.bet);
      state.bet *= 2;
    }
  }

  if (action === "hit" || action === "double") {
    state.ph.push(drawCard(state.deck));
    const v = handValue(state.ph);
    if (v > 21) {
      bjGames.delete(userId);
      return i.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("🃏 BUST!")
            .setDescription(
              `**Your hand:** ${handStr(state.ph)} = **${v}** — BUST!\n❌ Lost **${formatCoins(state.bet)}**\n💰 Balance: **${formatCoins(db.getUser(userId).balance)}**`
            ),
        ],
        components: [],
      });
    }
    if (v === 21 || action === "double") return resolveDealer(i, userId, state);
    return i.editReply({
      embeds: [bjEmbed(state.ph, state.dh, state.bet, `Your total: **${v}**. Continue?`)],
      components: [bjRow(userId, false)],
    });
  }

  if (action === "stand") return resolveDealer(i, userId, state);
}

async function resolveDealer(i, userId, state) {
  while (handValue(state.dh) < 17) state.dh.push(drawCard(state.deck));
  const pv = handValue(state.ph),
    dv = handValue(state.dh);
  let result, color, payout = 0;
  if (dv > 21 || pv > dv) {
    payout = state.bet * 2;
    result = `🏆 **You Win!** Dealer: ${dv}. Won **${formatCoins(payout)}**!`;
    color = 0x00ff88;
  } else if (pv === dv) {
    payout = state.bet;
    result = `🤝 **Push!** Bet returned.`;
    color = 0xffaa00;
  } else {
    result = `😞 **Dealer wins** (${dv}). Lost **${formatCoins(state.bet)}**.`;
    color = 0xff4444;
  }
  if (payout > 0) db.addCoins(userId, i.user.username, payout);
  bjGames.delete(userId);
  return i.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle("🃏 Blackjack — Result")
        .setDescription(
          `**Your hand:** ${handStr(state.ph)} = **${pv}**\n**Dealer:** ${handStr(state.dh)} = **${dv}**\n\n${result}\n💰 Balance: **${formatCoins(db.getUser(userId).balance)}**`
        ),
    ],
    components: [],
  });
}

function bjRow(uid, showDouble) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit_${uid}`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bj_stand_${uid}`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Danger)
  );
  if (showDouble)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`bj_double_${uid}`)
        .setLabel("Double Down")
        .setStyle(ButtonStyle.Primary)
    );
  return row;
}

function bjEmbed(ph, dh, bet, status) {
  return new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle("🃏 Blackjack")
    .setDescription(
      `**Your hand:** ${handStr(ph)} = **${handValue(ph)}**\n**Dealer shows:** ${dh[0].display} | 🂠\n\n**Bet:** ${formatCoins(bet)}\n\n${status}`
    );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHOP & INVENTORY  —  Rate: 100 LEN = 15 Robux
// ══════════════════════════════════════════════════════════════════════════════

const ROBUX_PACKAGES = [
  { name: "Robux S",  coins: 100,  robux: 15  },
  { name: "Robux M",  coins: 300,  robux: 45  },
  { name: "Robux L",  coins: 700,  robux: 105 },
  { name: "Robux XL", coins: 1500, robux: 225 },
];

async function cmdShop(i) {
  const extras = db.getShopItems();
  const embed = new EmbedBuilder()
    .setColor(0x00b4ff)
    .setTitle("🛒  LEN Coin Shop — Robux Packages")
    .setDescription(`**Rate: ${COIN_EMOJI} 100 LEN Coins = <:Robux:1483371422368792648> 15 Robux**\n\u200B`);

  ROBUX_PACKAGES.forEach((p) => {
    embed.addFields({
      name: `<:Robux:1483371422368792648> ${p.name}`,
      value: `<:Coin:1483370941583982612> **${p.coins.toLocaleString()} LEN** → **${p.robux} R$**\n\`/buy ${p.name}\``,
      inline: true,
    });
  });

  if (extras.length) {
    embed.addFields({ name: "\u200B", value: "**— Other Items —**" });
    extras.forEach((it) => {
      const stock =
        it.stock === -1 ? "∞" : it.stock === 0 ? "❌ Out of stock" : `${it.stock} left`;
      embed.addFields({
        name: `${it.emoji || "📦"} ${it.name} — <:Coin:1483370941583982612> ${it.price.toLocaleString()} LEN`,
        value: `${it.description}\nStock: ${stock}\n\`/buy ${it.name}\``,
        inline: true,
      });
    });
  }

  embed.setFooter({ text: "Contact staff after purchase to receive Robux" });
  return i.reply({ embeds: [embed] });
}

async function cmdBuy(i) {
  const input = i.options.getString("item").toLowerCase().trim();
  const pkg = ROBUX_PACKAGES.find((p) => p.name.toLowerCase() === input);

  if (pkg) {
    const user = db.getUser(i.user.id, i.user.username);
    if (user.balance < pkg.coins)
      return i.reply({
        content: `❌ Need **<:Coin:1483370941583982612> ${pkg.coins.toLocaleString()} LEN** — you have **${formatCoins(user.balance)}**.`,
        ephemeral: true,
      });
    db.removeCoins(i.user.id, pkg.coins);
    db.addToInventory(i.user.id, `${pkg.name} (${pkg.robux} Robux)`);
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle("✅ Purchase Successful!")
          .setDescription(
            `Bought **<:Robux:1483371422368792648> ${pkg.name}** for **<:Coin:1483370941583982612> ${pkg.coins.toLocaleString()} LEN**\n` +
              `You'll receive: **<:Robux:1483371422368792648> ${pkg.robux} Robux**\n\n` +
              `💰 Balance: **${formatCoins(db.getUser(i.user.id).balance)}**\n\n` +
              `> 📩 Contact staff to receive your Robux!`
          ),
      ],
    });
  }

  const items = db.getShopItems();
  const item = items.find((it) => it.name.toLowerCase() === input);
  if (!item)
    return i.reply({ content: "❌ Item not found. Check `/shop`.", ephemeral: true });
  if (item.stock === 0)
    return i.reply({ content: "❌ Out of stock!", ephemeral: true });
  const user = db.getUser(i.user.id, i.user.username);
  if (user.balance < item.price)
    return i.reply({
      content: `❌ Need **${formatCoins(item.price)}** — you have **${formatCoins(user.balance)}**.`,
      ephemeral: true,
    });
  db.removeCoins(i.user.id, item.price);
  db.addToInventory(i.user.id, item.name);
  if (item.stock > 0) db.decrementStock(item.name);
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle("✅ Purchase Successful!")
        .setDescription(
          `Bought **${item.emoji || "📦"} ${item.name}** for **${formatCoins(item.price)}**\n💰 Balance: **${formatCoins(db.getUser(i.user.id).balance)}**`
        ),
    ],
  });
}

async function cmdInventory(i) {
  const target = i.options.getUser("user") || i.user;
  const inv = db.getInventory(target.id);
  if (!inv.length)
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x7289da)
          .setTitle(`🎒 ${target.username}'s Inventory`)
          .setDescription("Empty! Use `/shop` to browse."),
      ],
    });
  const grouped = {};
  inv.forEach((it) => {
    grouped[it] = (grouped[it] || 0) + 1;
  });
  const desc = Object.entries(grouped)
    .map(([n, q]) => `• **${n}** × ${q}`)
    .join("\n");
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle(`🎒 ${target.username}'s Inventory`)
        .setDescription(desc)
        .setThumbnail(target.displayAvatarURL())
        .setFooter({ text: `${inv.length} total items` }),
    ],
  });
}

async function cmdUse(i) {
  const input = i.options.getString("item").toLowerCase();
  const inv = db.getInventory(i.user.id);
  const idx = inv.findIndex((it) => it.toLowerCase().includes(input));
  if (idx === -1)
    return i.reply({ content: "❌ You don't have that item. Check `/inventory`.", ephemeral: true });

  const itemName = inv[idx];

  // Only show the form for Robux packages — other items just confirm directly
  const isRobux = itemName.toLowerCase().includes("robux");
  if (!isRobux) {
    db.removeFromInventory(i.user.id, itemName);
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle("✨ Item Redeemed")
          .setDescription(`You redeemed **${itemName}**!\n\n> 📩 Contact staff to receive your reward.`),
      ],
    });
  }

  // Show modal form for Robux items
  const modal = new ModalBuilder()
    .setCustomId(`redeem_modal_${i.user.id}_${encodeURIComponent(itemName)}`)
    .setTitle("Robux Redemption Form");

  const usernameInput = new TextInputBuilder()
    .setCustomId("roblox_username")
    .setLabel("Your Roblox Username")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. Builderman")
    .setRequired(true);

  const gampassInput = new TextInputBuilder()
    .setCustomId("gamepass_link")
    .setLabel("Gamepass Link")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://www.roblox.com/game-pass/...")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(usernameInput),
    new ActionRowBuilder().addComponents(gampassInput)
  );

  return i.showModal(modal);
}

// ── Modal submission handler ───────────────────────────────────────────────────
async function handleModal(i) {
  if (!i.customId.startsWith("redeem_modal_")) return;

  const parts    = i.customId.split("_");
  // format: redeem_modal_USERID_ITEMNAME
  const userId   = parts[2];
  const itemName = decodeURIComponent(parts.slice(3).join("_"));

  if (i.user.id !== userId)
    return i.reply({ content: "❌ This form isn't for you.", ephemeral: true });

  const robloxUsername = i.fields.getTextInputValue("roblox_username").trim();
  const gampassLink    = i.fields.getTextInputValue("gamepass_link").trim();

  // Validate gamepass link loosely
  if (!gampassLink.includes("roblox.com")) {
    return i.reply({ content: "❌ That doesn't look like a valid Roblox gamepass link. Please try `/use` again.", ephemeral: true });
  }

  // Remove item from inventory
  db.removeFromInventory(userId, itemName);

  // Save the redemption request
  const requestId = db.addRedemption({
    userId,
    username:       i.user.username,
    itemName,
    robloxUsername,
    gampassLink,
    timestamp:      Date.now(),
    status:         "pending",
  });

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle("<:Coin:1483370941583982612> Redemption Submitted!")
        .setDescription(
          `Your request has been submitted! Staff will process it soon.\n\n` +
          `**Item:** ${itemName}\n` +
          `**Roblox Username:** ${robloxUsername}\n` +
          `**Gamepass Link:** ${gampassLink}\n\n` +
          `**Request ID:** \`#${requestId}\`\n\n` +
          `> You'll receive a DM when your Robux has been sent! <:Robux:1483371422368792648>`
        ),
    ],
    ephemeral: true,
  });
}

// ── /check-uses ───────────────────────────────────────────────────────────────
async function cmdCheckUses(i) {
  if (!await guardAdmin(i)) return;

  const pending = db.getPendingRedemptions();

  if (!pending.length) {
    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle("✅ No Pending Requests")
          .setDescription("There are no pending Robux redemptions right now."),
      ],
      ephemeral: true,
    });
  }

  // Split into pages of 5 if needed
  const embed = new EmbedBuilder()
    .setColor(0x00b4ff)
    .setTitle(`<:Robux:1483371422368792648> Pending Redemptions (${pending.length})`)
    ;

  pending.forEach((r) => {
    embed.addFields({
      name: `#${r.id} — ${r.itemName}`,
      value:
        `👤 **Discord:** <@${r.userId}> (${r.username})\n` +
        `🎮 **Roblox:** \`${r.robloxUsername}\`\n` +
        `🔗 **Gamepass:** ${r.gampassLink}\n` +

        `> Use \`/use-done ${r.id}\` to mark as paid`,
      inline: false,
    });
  });

  return i.reply({ embeds: [embed], ephemeral: true });
}

// ── /use-done ─────────────────────────────────────────────────────────────────
async function cmdUseDone(i) {
  if (!await guardAdmin(i)) return;

  const requestId = i.options.getInteger("id");
  const request   = db.getRedemption(requestId);

  if (!request) {
    return i.reply({ content: `❌ No redemption request found with ID **#${requestId}**.`, ephemeral: true });
  }

  if (request.status === "paid") {
    return i.reply({ content: `❌ Request **#${requestId}** has already been marked as paid.`, ephemeral: true });
  }

  // Mark as paid
  db.markRedemptionPaid(requestId, i.user.tag);

  // DM the user
  try {
    const user = await client.users.fetch(request.userId);
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle("<:Robux:1483371422368792648> Your Robux Has Been Sent!")
          .setDescription(
            `Your redemption request has been fulfilled! 🎉\n\n` +
            `**Item:** ${request.itemName}\n` +
            `**Roblox Username:** ${request.robloxUsername}\n` +
            `**Gamepass Link:** ${request.gampassLink}\n\n` +
            `**Request ID:** \`#${requestId}\`\n` +
            `**Processed by:** ${i.user.tag}\n\n` +
            `> Thank you for using the LEN Coin Shop! <:Coin:1483370941583982612>`
          )
          ,
      ],
    });

    return i.reply({
      embeds: [
        adminEmbed(
          `✅ Request **#${requestId}** marked as paid!\n\n` +
          `**User:** <@${request.userId}> (${request.username})\n` +
          `**Item:** ${request.itemName}\n` +
          `**Roblox:** \`${request.robloxUsername}\`\n\n` +
          `📩 DM sent to the user successfully.`
        ),
      ],
    });
  } catch {
    return i.reply({
      embeds: [
        adminEmbed(
          `✅ Request **#${requestId}** marked as paid!\n\n` +
          `**User:** <@${request.userId}> (${request.username})\n` +
          `**Item:** ${request.itemName}\n\n` +
          `⚠️ Could not send DM — user may have DMs disabled.`
        ),
      ],
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  INFO COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdUserinfo(i) {
  const target = i.options.getMember("user") || i.member;
  const user = target.user;
  const warns = db.getWarnings(user.id).length;
  const balance = db.getUser(user.id, user.username).balance;
  const roles = target.roles.cache
    .filter((r) => r.id !== i.guild.id)
    .map((r) => `<@&${r.id}>`)
    .join(", ") || "None";

  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(target.displayHexColor || 0x7289da)
        .setTitle(`👤 ${user.tag}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "🪪 ID",        value: user.id,                inline: true },
          { name: "💰 Balance",   value: formatCoins(balance),   inline: true },
          { name: "⚠️ Warns",    value: `${warns}`,             inline: true },
          { name: `🎭 Roles (${target.roles.cache.size - 1})`,
            value: roles.length > 1024 ? "Too many to display" : roles,
            inline: false },
        )
        ,
    ],
  });
}

async function cmdServerinfo(i) {
  const g = i.guild;
  await g.fetch();
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x7289da)
        .setTitle(`🏠 ${g.name}`)
        .setThumbnail(g.iconURL())
        .addFields(
          { name: "🪪 ID",       value: g.id,                                                             inline: true },
          { name: "👑 Owner",    value: `<@${g.ownerId}>`,                                               inline: true },
          { name: "👥 Members",  value: g.memberCount.toLocaleString(),                                  inline: true },
          { name: "💬 Channels", value: g.channels.cache.size.toLocaleString(),                          inline: true },
          { name: "🎭 Roles",    value: g.roles.cache.size.toLocaleString(),                             inline: true },
          { name: "😀 Emojis",   value: g.emojis.cache.size.toLocaleString(),                            inline: true },
          { name: "💎 Boost",    value: `Tier ${g.premiumTier} (${g.premiumSubscriptionCount} boosts)`,  inline: true },
        )
        ,
    ],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  STOCK COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdShowStock(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel("channel");
  const robux = i.options.getInteger("robux");
  const embed = buildStockEmbed(robux, i.user);
  const existing = db.getStockMessage(channel.id);
  if (existing) {
    try {
      const msg = await channel.messages.fetch(existing);
      await msg.edit({ embeds: [embed] });
      return i.reply({
        content: `✅ Stock updated in <#${channel.id}> → **${robux.toLocaleString()} R$**`,
        ephemeral: true,
      });
    } catch { /* deleted, post fresh */ }
  }
  const msg = await channel.send({ embeds: [embed] });
  db.setStockMessage(channel.id, msg.id);
  return i.reply({
    content: `✅ Stock embed posted in <#${channel.id}> → **${robux.toLocaleString()} R$**`,
    ephemeral: true,
  });
}

async function cmdSetStock(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel("channel");
  const robux = i.options.getInteger("robux");
  const existing = db.getStockMessage(channel.id);
  if (!existing)
    return i.reply({
      content: `❌ No stock embed found in <#${channel.id}>. Use \`/show-stock\` first.`,
      ephemeral: true,
    });
  try {
    const msg = await channel.messages.fetch(existing);
    await msg.edit({ embeds: [buildStockEmbed(robux, i.user)] });
    return i.reply({
      content: `✅ Stock updated → **${robux.toLocaleString()} R$** in <#${channel.id}>`,
      ephemeral: true,
    });
  } catch {
    db.setStockMessage(channel.id, null);
    return i.reply({
      content: `❌ Couldn't find the embed. Use \`/show-stock\` to post a new one.`,
      ephemeral: true,
    });
  }
}

function buildStockEmbed(robux, updatedBy) {
  const oos = robux === 0;
  const low = robux > 0 && robux < 100;
  const color = oos ? 0xff4444 : low ? 0xffaa00 : 0x00e676;
  const status = oos
    ? "🔴  **OUT OF STOCK**"
    : low
    ? "🟡  **LOW STOCK**"
    : "🟢  **IN STOCK**";
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("STOCK")
    .setDescription(`${status}\n\u200B`)
    .addFields(
      { name: "ROBUX", value: `\`\`\`\n<:Robux:1483371422368792648>  ${robux.toLocaleString()} R$\n\`\`\``, inline: false },
      { name: "💱 Rate",       value: `<:Coin:1483370941583982612> **100 LEN = <:Robux:1483371422368792648> 15 Robux**`,          inline: true },
      { name: "🛒 How to Buy", value: "`/shop` then `/buy <package>`",           inline: true }
    )
    .setFooter({ text: `Last updated by ${updatedBy?.username ?? "Admin"} • LEN Coin Store` })
    ;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ECONOMY ADMIN COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdAddCoins(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  db.addCoins(target.id, target.username, amount);
  return i.reply({
    embeds: [adminEmbed(`✅ Added **${formatCoins(amount)}** to **${target.username}**\nNew balance: **${formatCoins(db.getUser(target.id).balance)}**`)],
  });
}

async function cmdRemoveCoins(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  db.removeCoins(target.id, amount);
  return i.reply({
    embeds: [adminEmbed(`✅ Removed **${formatCoins(amount)}** from **${target.username}**\nNew balance: **${formatCoins(db.getUser(target.id).balance)}**`)],
  });
}

async function cmdSetCoins(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  db.setCoins(target.id, target.username, amount);
  return i.reply({
    embeds: [adminEmbed(`✅ Set **${target.username}**'s balance to **${formatCoins(amount)}**`)],
  });
}

async function cmdResetDaily(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  db.setLastDaily(target.id, 0);
  return i.reply({
    embeds: [adminEmbed(`✅ Reset daily for **${target.username}**`)],
  });
}

async function cmdAddItem(i) {
  if (!await guardAdmin(i)) return;
  const item = {
    name:        i.options.getString("name"),
    price:       i.options.getInteger("price"),
    description: i.options.getString("description"),
    emoji:       i.options.getString("emoji") || "📦",
    stock:       i.options.getInteger("stock") ?? -1,
  };
  db.addShopItem(item);
  return i.reply({
    embeds: [adminEmbed(`✅ Added **${item.emoji} ${item.name}** — **${formatCoins(item.price)}** (Stock: ${item.stock === -1 ? "∞" : item.stock})`)],
  });
}

async function cmdRemoveItem(i) {
  if (!await guardAdmin(i)) return;
  const name = i.options.getString("name").toLowerCase();
  const ok = db.removeShopItem(name);
  if (!ok) return i.reply({ content: "❌ Item not found.", ephemeral: true });
  return i.reply({ embeds: [adminEmbed(`✅ Removed **${name}** from the shop`)] });
}

async function cmdGiveItem(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  const item = i.options.getString("item");
  db.addToInventory(target.id, item);
  return i.reply({ embeds: [adminEmbed(`✅ Gave **${item}** to **${target.username}**`)] });
}

async function cmdClearInventory(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  db.clearInventory(target.id);
  return i.reply({ embeds: [adminEmbed(`✅ Cleared **${target.username}**'s inventory`)] });
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODERATION COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdTimeout(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getMember("user");
  const minutes = i.options.getInteger("minutes");
  const reason = i.options.getString("reason") || "No reason provided";
  if (!target) return i.reply({ content: "❌ User not found.", ephemeral: true });
  if (target.id === i.user.id) return i.reply({ content: "❌ Can't timeout yourself.", ephemeral: true });
  if (!target.moderatable) return i.reply({ content: "❌ I can't timeout this user (check role hierarchy).", ephemeral: true });
  await target.timeout(minutes * 60 * 1000, reason);
  return i.reply({
    embeds: [modEmbed("🔇 User Timed Out", `**User:** ${target.user.tag}\n**Duration:** ${minutes} minute(s)\n**Reason:** ${reason}\n**By:** ${i.user.tag}`, 0xff8800)],
  });
}

async function cmdUntimeout(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getMember("user");
  if (!target) return i.reply({ content: "❌ User not found.", ephemeral: true });
  await target.timeout(null);
  return i.reply({
    embeds: [modEmbed("🔊 Timeout Removed", `**User:** ${target.user.tag}\n**By:** ${i.user.tag}`, 0x00ff88)],
  });
}

async function cmdWarn(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  const reason = i.options.getString("reason");
  const count = db.addWarning(target.id, target.username, reason, i.user.tag);
  try {
    await target.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle(`⚠️ You have been warned in ${i.guild.name}`)
          .addFields(
            { name: "Reason",           value: reason,    inline: false },
            { name: "Warned by",        value: i.user.tag, inline: true  },
            { name: "Total Warnings",   value: `${count}`, inline: true  }
          )
          ,
      ],
    });
  } catch { /* DMs closed */ }
  return i.reply({
    embeds: [modEmbed("⚠️ User Warned", `**User:** ${target.tag}\n**Reason:** ${reason}\n**Total warnings:** ${count}\n**By:** ${i.user.tag}`, 0xffaa00)],
  });
}

async function cmdWarnings(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  const warnings = db.getWarnings(target.id);
  if (!warnings.length)
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle(`⚠️ ${target.username}'s Warnings`).setDescription("No warnings on record.")],
    });
  const desc = warnings
    .map((w, idx) => `**${idx + 1}.** ${w.reason}\n> By ${w.by}`)
    .join("\n\n");
  return i.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle(`⚠️ ${target.username}'s Warnings (${warnings.length})`)
        .setDescription(desc)
        .setThumbnail(target.displayAvatarURL()),
    ],
  });
}

async function cmdClearWarnings(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getUser("user");
  db.clearWarnings(target.id);
  return i.reply({ embeds: [adminEmbed(`✅ Cleared all warnings for **${target.username}**`)] });
}

async function cmdKick(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getMember("user");
  const reason = i.options.getString("reason") || "No reason provided";
  if (!target) return i.reply({ content: "❌ User not found.", ephemeral: true });
  if (!target.kickable) return i.reply({ content: "❌ I can't kick this user.", ephemeral: true });
  try {
    await target.user.send({
      embeds: [new EmbedBuilder().setColor(0xff4444).setTitle(`👢 You were kicked from ${i.guild.name}`).setDescription(`**Reason:** ${reason}`)],
    });
  } catch { /* DMs closed */ }
  await target.kick(reason);
  return i.reply({
    embeds: [modEmbed("👢 User Kicked", `**User:** ${target.user.tag}\n**Reason:** ${reason}\n**By:** ${i.user.tag}`, 0xff4444)],
  });
}

async function cmdBan(i) {
  if (!await guardAdmin(i)) return;
  const target = i.options.getMember("user");
  const reason = i.options.getString("reason") || "No reason provided";
  const delDays = i.options.getInteger("delete_days") ?? 0;
  if (!target) return i.reply({ content: "❌ User not found.", ephemeral: true });
  if (!target.bannable) return i.reply({ content: "❌ I can't ban this user.", ephemeral: true });
  try {
    await target.user.send({
      embeds: [new EmbedBuilder().setColor(0xff0000).setTitle(`🔨 You were banned from ${i.guild.name}`).setDescription(`**Reason:** ${reason}`)],
    });
  } catch { /* DMs closed */ }
  await target.ban({ reason, deleteMessageDays: delDays });
  return i.reply({
    embeds: [modEmbed("🔨 User Banned", `**User:** ${target.user.tag}\n**Reason:** ${reason}\n**Msgs deleted:** ${delDays}d\n**By:** ${i.user.tag}`, 0xff0000)],
  });
}

async function cmdUnban(i) {
  if (!await guardAdmin(i)) return;
  const userId = i.options.getString("userid");
  const reason = i.options.getString("reason") || "No reason provided";
  try {
    await i.guild.members.unban(userId, reason);
    return i.reply({
      embeds: [modEmbed("✅ User Unbanned", `**User ID:** ${userId}\n**Reason:** ${reason}\n**By:** ${i.user.tag}`, 0x00ff88)],
    });
  } catch {
    return i.reply({ content: "❌ Couldn't unban — invalid ID or user isn't banned.", ephemeral: true });
  }
}

async function cmdPurge(i) {
  if (!await guardAdmin(i)) return;
  const amount = i.options.getInteger("amount");
  const filter = i.options.getUser("user");
  await i.deferReply({ ephemeral: true });
  let messages = await i.channel.messages.fetch({ limit: 100 });
  if (filter) messages = messages.filter((m) => m.author.id === filter.id);
  const toDelete = [...messages.values()]
    .slice(0, amount)
    .filter((m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
  const deleted = await i.channel.bulkDelete(toDelete, true);
  return i.editReply({ content: `🗑️ Deleted **${deleted.size}** message(s).` });
}

async function cmdSlowmode(i) {
  if (!await guardAdmin(i)) return;
  const seconds = i.options.getInteger("seconds");
  const channel = i.options.getChannel("channel") || i.channel;
  await channel.setRateLimitPerUser(seconds);
  const text = seconds === 0 ? "Slowmode **disabled**" : `Slowmode set to **${seconds}s**`;
  return i.reply({ embeds: [adminEmbed(`⏱️ ${text} in <#${channel.id}>`)] });
}

async function cmdLock(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel("channel") || i.channel;
  const reason = i.options.getString("reason") || "No reason provided";
  await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: false });
  return i.reply({
    embeds: [modEmbed("🔒 Channel Locked", `<#${channel.id}> has been locked.\n**Reason:** ${reason}`, 0xff4444)],
  });
}

async function cmdUnlock(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel("channel") || i.channel;
  await channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null });
  return i.reply({
    embeds: [modEmbed("🔓 Channel Unlocked", `<#${channel.id}> is now open.`, 0x00ff88)],
  });
}

async function cmdAnnounce(i) {
  if (!await guardAdmin(i)) return;
  const channel = i.options.getChannel("channel");
  const title   = i.options.getString("title");
  const message = i.options.getString("message");
  const colorHex = i.options.getString("color");
  let color = 0x5865f2;
  if (colorHex) {
    const parsed = parseInt(colorHex.replace("#", ""), 16);
    if (!isNaN(parsed)) color = parsed;
  }
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(`📢 ${title}`)
        .setDescription(message)
        .setFooter({ text: `Announced by ${i.user.username}` })
        ,
    ],
  });
  return i.reply({ content: `✅ Announcement sent to <#${channel.id}>`, ephemeral: true });
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function adminEmbed(desc) {
  return new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle("🔧 Admin Action")
    .setDescription(desc)
    ;
}

function modEmbed(title, desc, color) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
}

function buildDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck  = [];
  for (const s of suits)
    for (const r of ranks)
      deck.push({
        display: `${r}${s}`,
        value: r === "A" ? 11 : ["J","Q","K"].includes(r) ? 10 : parseInt(r),
        rank: r,
      });
  for (let n = deck.length - 1; n > 0; n--) {
    const k = Math.floor(Math.random() * (n + 1));
    [deck[n], deck[k]] = [deck[k], deck[n]];
  }
  return deck;
}

function drawCard(deck) { return deck.pop(); }

function handValue(h) {
  let t = h.reduce((s, c) => s + c.value, 0);
  let a = h.filter((c) => c.rank === "A").length;
  while (t > 21 && a > 0) { t -= 10; a--; }
  return t;
}

function handStr(h) { return h.map((c) => c.display).join(" "); }

// ─── Boot ──────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await db.init();                    // ← load JSONBin data first
  await registerCommands();
  client.user.setActivity("LEN Coin Economy | /shop", { type: 3 });
});

client.login(process.env.DISCORD_TOKEN);
