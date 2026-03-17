const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  ],
});

const db = new Database();

// ─── Slash Command Definitions ────────────────────────────────────────────────
const commands = [
  // Economy
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
      o.setName("amount").setDescription("Amount to send").setRequired(true).setMinValue(1)
    ),

  // Gambling
  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin and double your bet or lose it!")
    .addStringOption((o) =>
      o.setName("side").setDescription("heads or tails").setRequired(true)
        .addChoices(
          { name: "Heads", value: "heads" },
          { name: "Tails", value: "tails" }
        )
    )
    .addIntegerOption((o) =>
      o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Spin the slot machine!")
    .addIntegerOption((o) =>
      o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of Blackjack!")
    .addIntegerOption((o) =>
      o.setName("bet").setDescription("Amount to bet").setRequired(true).setMinValue(1)
    ),

  // Shop & Inventory
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Browse the LEN Coin Robux shop"),

  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy a Robux package from the shop")
    .addStringOption((o) =>
      o.setName("item").setDescription("Package name (e.g. Robux S, Robux M, Robux L, Robux XL)").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to check").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("use")
    .setDescription("Redeem an item from your inventory")
    .addStringOption((o) =>
      o.setName("item").setDescription("Item name").setRequired(true)
    ),

  // Stock / Robux
  new SlashCommandBuilder()
    .setName("show-stock")
    .setDescription("Post or update the Robux stock embed in a channel")
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Target channel").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("robux").setDescription("Robux amount currently in stock").setRequired(true).setMinValue(0)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Admin
  new SlashCommandBuilder()
    .setName("addcoins")
    .setDescription("[Admin] Add LEN Coins to a user")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("removecoins")
    .setDescription("[Admin] Remove LEN Coins from a user")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(1))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("setcoins")
    .setDescription("[Admin] Set a user's LEN Coins to an exact amount")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addIntegerOption((o) => o.setName("amount").setDescription("Amount").setRequired(true).setMinValue(0))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("additem")
    .setDescription("[Admin] Add a custom item to the shop")
    .addStringOption((o) => o.setName("name").setDescription("Item name").setRequired(true))
    .addIntegerOption((o) => o.setName("price").setDescription("Price in LEN Coins").setRequired(true).setMinValue(1))
    .addStringOption((o) => o.setName("description").setDescription("Item description").setRequired(true))
    .addStringOption((o) => o.setName("emoji").setDescription("Item emoji").setRequired(false))
    .addIntegerOption((o) => o.setName("stock").setDescription("Stock quantity (-1 for unlimited)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("removeitem")
    .setDescription("[Admin] Remove a custom item from the shop")
    .addStringOption((o) => o.setName("name").setDescription("Item name").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("giveitem")
    .setDescription("[Admin] Give an item directly to a user")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .addStringOption((o) => o.setName("item").setDescription("Item name").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("resetdaily")
    .setDescription("[Admin] Reset a user's daily cooldown")
    .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

].map((c) => c.toJSON());

// ─── Register Commands ────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log("Registering slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("✅ Slash commands registered globally.");
  } catch (err) {
    console.error("Failed to register commands:", err);
  }
}

// ─── Message Reward (1 msg = 1 LEN Coin, 5s cooldown) ────────────────────────
const messageCooldowns = new Map();

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;
  const userId = message.author.id;
  const now    = Date.now();
  if (messageCooldowns.has(userId) && now - messageCooldowns.get(userId) < 5000) return;
  messageCooldowns.set(userId, now);
  db.addCoins(userId, message.author.username, 1);
});

// ─── Interaction Handler ──────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton()) return handleButton(interaction);
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case "balance":     return cmdBalance(interaction);
      case "daily":       return cmdDaily(interaction);
      case "leaderboard": return cmdLeaderboard(interaction);
      case "pay":         return cmdPay(interaction);
      case "coinflip":    return cmdCoinflip(interaction);
      case "slots":       return cmdSlots(interaction);
      case "blackjack":   return cmdBlackjack(interaction);
      case "shop":        return cmdShop(interaction);
      case "buy":         return cmdBuy(interaction);
      case "inventory":   return cmdInventory(interaction);
      case "use":         return cmdUse(interaction);
      case "show-stock":  return cmdShowStock(interaction);
      case "addcoins":    return cmdAddCoins(interaction);
      case "removecoins": return cmdRemoveCoins(interaction);
      case "setcoins":    return cmdSetCoins(interaction);
      case "additem":     return cmdAddItem(interaction);
      case "removeitem":  return cmdRemoveItem(interaction);
      case "giveitem":    return cmdGiveItem(interaction);
      case "resetdaily":  return cmdResetDaily(interaction);
    }
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = { content: "⚠️ An error occurred. Please try again.", ephemeral: true };
    interaction.replied ? interaction.followUp(msg) : interaction.reply(msg);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  ECONOMY COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdBalance(i) {
  const target = i.options.getUser("user") || i.user;
  const data   = db.getUser(target.id, target.username);

  return i.reply({
    embeds: [new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${COIN_EMOJI} ${target.username}'s Balance`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: "💰 Wallet",       value: formatCoins(data.balance),    inline: true },
        { name: "📈 Total Earned", value: formatCoins(data.totalEarned), inline: true },
        { name: "💬 Messages",     value: data.messages.toLocaleString(), inline: true }
      )
      .setFooter({ text: "1 message = 1 LEN Coin • Rate: 100 LEN = 15 Robux" })
      .setTimestamp()],
  });
}

async function cmdDaily(i) {
  const data    = db.getUser(i.user.id, i.user.username);
  const now     = Date.now();
  const COOLDOWN = 24 * 60 * 60 * 1000;

  if (data.lastDaily && now - data.lastDaily < COOLDOWN) {
    const rem = COOLDOWN - (now - data.lastDaily);
    const h   = Math.floor(rem / 3600000);
    const m   = Math.floor((rem % 3600000) / 60000);
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0xff4444)
        .setTitle("⏰ Already Claimed")
        .setDescription(`Come back in **${h}h ${m}m**.`)],
      ephemeral: true,
    });
  }

  db.addCoins(i.user.id, i.user.username, 100);
  db.setLastDaily(i.user.id);

  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88)
      .setTitle("🎁 Daily Reward!")
      .setDescription(
        `You received **${formatCoins(100)}**!\n` +
        `New balance: **${formatCoins(db.getUser(i.user.id).balance)}**`
      )
      .setThumbnail(i.user.displayAvatarURL())
      .setFooter({ text: "Come back in 24 hours!" })],
  });
}

async function cmdLeaderboard(i) {
  const top  = db.getLeaderboard(10);
  const desc = top.map((u, idx) => {
    const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `**${idx + 1}.**`;
    return `${medal} <@${u.userId}> — ${formatCoins(u.balance)}`;
  }).join("\n") || "No users yet!";

  return i.reply({
    embeds: [new EmbedBuilder().setColor(0xffd700)
      .setTitle(`${COIN_EMOJI} LEN Coin Leaderboard`)
      .setDescription(desc)
      .setFooter({ text: `Top ${top.length} users` })
      .setTimestamp()],
  });
}

async function cmdPay(i) {
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");

  if (target.id === i.user.id) return i.reply({ content: "❌ You can't pay yourself!", ephemeral: true });
  if (target.bot)               return i.reply({ content: "❌ You can't pay bots!", ephemeral: true });

  const sender = db.getUser(i.user.id, i.user.username);
  if (sender.balance < amount)
    return i.reply({ content: `❌ Insufficient funds. You have **${formatCoins(sender.balance)}**.`, ephemeral: true });

  db.removeCoins(i.user.id, amount);
  db.addCoins(target.id, target.username, amount);

  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88)
      .setTitle("💸 Transfer Successful")
      .setDescription(`**${i.user.username}** sent **${formatCoins(amount)}** to **${target.username}**`)],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  GAMBLING COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdCoinflip(i) {
  const side = i.options.getString("side");
  const bet  = i.options.getInteger("bet");
  const user = db.getUser(i.user.id, i.user.username);

  if (user.balance < bet)
    return i.reply({ content: `❌ You only have **${formatCoins(user.balance)}**.`, ephemeral: true });

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won    = result === side;

  if (won) db.addCoins(i.user.id, i.user.username, bet);
  else     db.removeCoins(i.user.id, bet);

  const newBal = db.getUser(i.user.id).balance;

  return i.reply({
    embeds: [new EmbedBuilder()
      .setColor(won ? 0x00ff88 : 0xff4444)
      .setTitle(won ? "🪙 You Won!" : "🪙 You Lost!")
      .setDescription(
        `The coin landed on **${result}** ${result === "heads" ? "👑" : "🔵"}\n` +
        `You guessed **${side}**\n\n` +
        (won ? `✅ Won **${formatCoins(bet)}**!` : `❌ Lost **${formatCoins(bet)}**`) +
        `\n\n💰 Balance: **${formatCoins(newBal)}**`
      )],
  });
}

async function cmdSlots(i) {
  const bet  = i.options.getInteger("bet");
  const user = db.getUser(i.user.id, i.user.username);

  if (user.balance < bet)
    return i.reply({ content: `❌ You only have **${formatCoins(user.balance)}**.`, ephemeral: true });

  const symbols = ["🍒","🍋","🍊","🍇","⭐","💎","7️⃣"];
  const weights  = [ 30,  20,  20,  15,  10,   4,   1];

  function spin() {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let j = 0; j < symbols.length; j++) { r -= weights[j]; if (r <= 0) return symbols[j]; }
    return symbols[0];
  }

  const reels = [spin(), spin(), spin()];
  let multiplier = 0, resultText = "❌ No match — better luck next time!";

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    if      (reels[0] === "7️⃣") { multiplier = 20; resultText = "🎰 **JACKPOT! 7-7-7!** 20x!"; }
    else if (reels[0] === "💎")  { multiplier = 10; resultText = "💎 **Triple Diamonds!** 10x!"; }
    else if (reels[0] === "⭐")  { multiplier =  5; resultText = "⭐ **Triple Stars!** 5x!"; }
    else                          { multiplier =  3; resultText = `🎉 **Triple ${reels[0]}!** 3x!`; }
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    multiplier = 1.5; resultText = "✨ Two of a kind! 1.5x!";
  }

  let winnings = 0;
  if (multiplier > 0) {
    winnings = Math.floor(bet * multiplier);
    db.addCoins(i.user.id, i.user.username, winnings - bet);
  } else {
    db.removeCoins(i.user.id, bet);
  }

  const newBal = db.getUser(i.user.id).balance;

  return i.reply({
    embeds: [new EmbedBuilder()
      .setColor(multiplier > 0 ? 0xffd700 : 0xff4444)
      .setTitle("🎰 Slot Machine")
      .setDescription(
        `**[ ${reels.join(" | ")} ]**\n\n${resultText}\n\n` +
        (multiplier > 0 ? `✅ Won **${formatCoins(winnings)}** (+${formatCoins(winnings - bet)})` : `❌ Lost **${formatCoins(bet)}**`) +
        `\n💰 Balance: **${formatCoins(newBal)}**`
      )],
  });
}

// ── Blackjack ─────────────────────────────────────────────────────────────────
const bjGames = new Map();

async function cmdBlackjack(i) {
  const bet  = i.options.getInteger("bet");
  const user = db.getUser(i.user.id, i.user.username);

  if (user.balance < bet)
    return i.reply({ content: `❌ You only have **${formatCoins(user.balance)}**.`, ephemeral: true });

  const deck       = buildDeck();
  const playerHand = [drawCard(deck), drawCard(deck)];
  const dealerHand = [drawCard(deck), drawCard(deck)];

  bjGames.set(i.user.id, { bet, deck, playerHand, dealerHand });
  db.removeCoins(i.user.id, bet);

  const playerVal = handValue(playerHand);

  if (playerVal === 21) {
    const win = Math.floor(bet * 2.5);
    db.addCoins(i.user.id, i.user.username, win);
    bjGames.delete(i.user.id);
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("🃏 NATURAL BLACKJACK!")
        .setDescription(
          `**Your hand:** ${handStr(playerHand)} = **21**\n\n` +
          `🎉 Won **${formatCoins(win)}** (2.5x)\n` +
          `💰 Balance: **${formatCoins(db.getUser(i.user.id).balance)}**`
        )],
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj_hit_${i.user.id}`).setLabel("Hit").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bj_stand_${i.user.id}`).setLabel("Stand").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`bj_double_${i.user.id}`).setLabel("Double Down").setStyle(ButtonStyle.Primary)
  );

  return i.reply({
    embeds: [bjEmbed(playerHand, dealerHand, bet, "Your turn! Hit, Stand, or Double Down.")],
    components: [row],
  });
}

async function handleButton(i) {
  const parts  = i.customId.split("_");
  if (parts[0] !== "bj") return;
  const action = parts[1];
  const userId = parts[2];

  const state = bjGames.get(userId);
  if (!state)               return i.reply({ content: "No active game.", ephemeral: true });
  if (i.user.id !== userId) return i.reply({ content: "This isn't your game!", ephemeral: true });

  await i.deferUpdate();

  if (action === "hit" || action === "double") {
    if (action === "double") {
      const u = db.getUser(userId, i.user.username);
      if (u.balance >= state.bet) { db.removeCoins(userId, state.bet); state.bet *= 2; }
    }

    state.playerHand.push(drawCard(state.deck));
    const val = handValue(state.playerHand);

    if (val > 21) {
      bjGames.delete(userId);
      return i.editReply({
        embeds: [new EmbedBuilder().setColor(0xff4444).setTitle("🃏 BUST!")
          .setDescription(
            `**Your hand:** ${handStr(state.playerHand)} = **${val}** — BUST!\n` +
            `❌ Lost **${formatCoins(state.bet)}**\n` +
            `💰 Balance: **${formatCoins(db.getUser(userId).balance)}**`
          )],
        components: [],
      });
    }

    if (val === 21 || action === "double") return resolveDealer(i, userId, state);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bj_hit_${userId}`).setLabel("Hit").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bj_stand_${userId}`).setLabel("Stand").setStyle(ButtonStyle.Danger)
    );
    return i.editReply({
      embeds: [bjEmbed(state.playerHand, state.dealerHand, state.bet, `Your total: **${val}**. Continue?`)],
      components: [row],
    });
  }

  if (action === "stand") return resolveDealer(i, userId, state);
}

async function resolveDealer(i, userId, state) {
  while (handValue(state.dealerHand) < 17) state.dealerHand.push(drawCard(state.deck));

  const pVal = handValue(state.playerHand);
  const dVal = handValue(state.dealerHand);
  let result, color, payout = 0;

  if (dVal > 21 || pVal > dVal) {
    payout = state.bet * 2;
    result = `🏆 **You Win!** Dealer had ${dVal}. Won **${formatCoins(payout)}**!`;
    color  = 0x00ff88;
  } else if (pVal === dVal) {
    payout = state.bet;
    result = `🤝 **Push!** Tie — bet returned.`;
    color  = 0xffaa00;
  } else {
    result = `😞 **Dealer wins** with ${dVal}. Lost **${formatCoins(state.bet)}**.`;
    color  = 0xff4444;
  }

  if (payout > 0) db.addCoins(userId, i.user.username, payout);
  bjGames.delete(userId);

  return i.editReply({
    embeds: [new EmbedBuilder().setColor(color).setTitle("🃏 Blackjack — Result")
      .setDescription(
        `**Your hand:** ${handStr(state.playerHand)} = **${pVal}**\n` +
        `**Dealer hand:** ${handStr(state.dealerHand)} = **${dVal}**\n\n` +
        `${result}\n💰 Balance: **${formatCoins(db.getUser(userId).balance)}**`
      )],
    components: [],
  });
}

function bjEmbed(playerHand, dealerHand, bet, status) {
  return new EmbedBuilder().setColor(0x1a1a2e).setTitle("🃏 Blackjack")
    .setDescription(
      `**Your hand:** ${handStr(playerHand)} = **${handValue(playerHand)}**\n` +
      `**Dealer shows:** ${dealerHand[0].display} | 🂠\n\n` +
      `**Bet:** ${formatCoins(bet)}\n\n${status}`
    );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHOP & INVENTORY  — Rate: 100 LEN Coins = 15 Robux
// ══════════════════════════════════════════════════════════════════════════════

const ROBUX_PACKAGES = [
  { name: "Robux S",  coins: 100,  robux: 15  },
  { name: "Robux M",  coins: 300,  robux: 45  },
  { name: "Robux L",  coins: 700,  robux: 105 },
  { name: "Robux XL", coins: 1500, robux: 225 },
];

async function cmdShop(i) {
  const extraItems = db.getShopItems();

  const embed = new EmbedBuilder()
    .setColor(0x00b4ff)
    .setTitle("🛒  LEN Coin Shop — Robux Packages")
    .setDescription(
      `Buy Robux with your ${COIN_EMOJI} **LEN Coins**!\n` +
      `**Rate: 🪙 100 LEN Coins = 🎮 15 Robux**\n\u200B`
    )
    .setTimestamp();

  ROBUX_PACKAGES.forEach((pkg) => {
    embed.addFields({
      name:   `🎮 ${pkg.name}`,
      value:  `🪙 **${pkg.coins.toLocaleString()} LEN** → 🎮 **${pkg.robux} Robux**\n\`/buy ${pkg.name}\``,
      inline: true,
    });
  });

  if (extraItems.length) {
    embed.addFields({ name: "\u200B", value: "**— Other Items —**" });
    extraItems.forEach((item) => {
      const stockText = item.stock === -1 ? "∞" : item.stock === 0 ? "❌ Out of stock" : `${item.stock} left`;
      embed.addFields({
        name:   `${item.emoji || "📦"} ${item.name}`,
        value:  `🪙 **${item.price.toLocaleString()} LEN**\n${item.description}\nStock: ${stockText}\n\`/buy ${item.name}\``,
        inline: true,
      });
    });
  }

  embed.setFooter({ text: "Contact staff after purchase to receive your Robux" });
  return i.reply({ embeds: [embed] });
}

async function cmdBuy(i) {
  const input = i.options.getString("item").toLowerCase().trim();

  // Check built-in Robux packages first
  const pkg = ROBUX_PACKAGES.find((p) => p.name.toLowerCase() === input);
  if (pkg) {
    const user = db.getUser(i.user.id, i.user.username);
    if (user.balance < pkg.coins)
      return i.reply({
        content: `❌ You need **🪙 ${pkg.coins.toLocaleString()} LEN** but only have **${formatCoins(user.balance)}**.`,
        ephemeral: true,
      });

    db.removeCoins(i.user.id, pkg.coins);
    db.addToInventory(i.user.id, `${pkg.name} (${pkg.robux} Robux)`);

    return i.reply({
      embeds: [new EmbedBuilder().setColor(0x00ff88)
        .setTitle("✅ Purchase Successful!")
        .setDescription(
          `You bought **🎮 ${pkg.name}** for **🪙 ${pkg.coins.toLocaleString()} LEN**!\n` +
          `📦 You will receive: **🎮 ${pkg.robux} Robux**\n\n` +
          `💰 Remaining balance: **${formatCoins(db.getUser(i.user.id).balance)}**\n\n` +
          `> 📩 Contact a staff member with proof of purchase to receive your Robux.\n` +
          `> Or use \`/use ${pkg.name}\` to mark it as redeemed.`
        )],
    });
  }

  // Fall back to admin shop items
  const items = db.getShopItems();
  const item  = items.find((it) => it.name.toLowerCase() === input);

  if (!item)
    return i.reply({ content: `❌ Package not found. Check \`/shop\` for available packages.`, ephemeral: true });
  if (item.stock === 0)
    return i.reply({ content: "❌ This item is out of stock!", ephemeral: true });

  const user = db.getUser(i.user.id, i.user.username);
  if (user.balance < item.price)
    return i.reply({
      content: `❌ You need **${formatCoins(item.price)}** but only have **${formatCoins(user.balance)}**.`,
      ephemeral: true,
    });

  db.removeCoins(i.user.id, item.price);
  db.addToInventory(i.user.id, item.name);
  if (item.stock > 0) db.decrementStock(item.name);

  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle("✅ Purchase Successful!")
      .setDescription(
        `You bought **${item.emoji || "📦"} ${item.name}** for **${formatCoins(item.price)}**!\n` +
        `💰 Remaining balance: **${formatCoins(db.getUser(i.user.id).balance)}**\n\n` +
        `Use \`/use ${item.name}\` to redeem.`
      )],
  });
}

async function cmdInventory(i) {
  const target = i.options.getUser("user") || i.user;
  const inv    = db.getInventory(target.id);

  if (!inv.length)
    return i.reply({
      embeds: [new EmbedBuilder().setColor(0x7289da)
        .setTitle(`🎒 ${target.username}'s Inventory`)
        .setDescription("Empty! Use `/shop` to browse packages.")],
    });

  const grouped = {};
  inv.forEach((item) => { grouped[item] = (grouped[item] || 0) + 1; });

  const desc = Object.entries(grouped).map(([name, qty]) => `• **${name}** × ${qty}`).join("\n");

  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x7289da)
      .setTitle(`🎒 ${target.username}'s Inventory`)
      .setDescription(desc)
      .setThumbnail(target.displayAvatarURL())
      .setFooter({ text: `${inv.length} total items` })],
  });
}

async function cmdUse(i) {
  const input = i.options.getString("item").toLowerCase();
  const inv   = db.getInventory(i.user.id);
  const idx   = inv.findIndex((it) => it.toLowerCase().includes(input));

  if (idx === -1)
    return i.reply({ content: "❌ You don't have that item. Check `/inventory`.", ephemeral: true });

  const itemName = inv[idx];
  db.removeFromInventory(i.user.id, itemName);

  return i.reply({
    embeds: [new EmbedBuilder().setColor(0x00ff88).setTitle("✨ Item Redeemed")
      .setDescription(
        `You redeemed **${itemName}**!\n\n` +
        `> 📩 Contact a staff member to receive your reward.`
      )],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  SHOW-STOCK COMMAND
// ══════════════════════════════════════════════════════════════════════════════

async function cmdShowStock(i) {
  const channel = i.options.getChannel("channel");
  const robux   = i.options.getInteger("robux");

  const embed    = buildStockEmbed(robux, i.user);
  const existing = db.getStockMessage(channel.id);

  if (existing) {
    try {
      const msg = await channel.messages.fetch(existing);
      await msg.edit({ embeds: [embed] });
      return i.reply({
        content: `✅ Stock updated in <#${channel.id}> → **${robux.toLocaleString()} Robux** in stock.`,
        ephemeral: true,
      });
    } catch { /* message deleted — post a new one */ }
  }

  const msg = await channel.send({ embeds: [embed] });
  db.setStockMessage(channel.id, msg.id);

  return i.reply({
    content: `✅ Stock embed posted in <#${channel.id}> → **${robux.toLocaleString()} Robux** in stock.`,
    ephemeral: true,
  });
}

function buildStockEmbed(robux, updatedBy) {
  const outOfStock = robux === 0;
  const lowStock   = robux > 0 && robux < 100;
  const color      = outOfStock ? 0xff4444 : lowStock ? 0xffaa00 : 0x00e676;
  const statusLine = outOfStock
    ? "🔴  **OUT OF STOCK**"
    : lowStock
    ? "🟡  **LOW STOCK**"
    : "🟢  **IN STOCK**";

  return new EmbedBuilder()
    .setColor(color)
    // ── Title bar ──
    .setTitle("STOCK")
    // ── Status ──
    .setDescription(`${statusLine}\n\u200B`)
    // ── Robux amount ──
    .addFields(
      {
        name:  "ROBUX",
        value: `\`\`\`\n🎮  ${robux.toLocaleString()} R$\n\`\`\``,
        inline: false,
      },
      {
        name:  "💱 Rate",
        value: `🪙 **100 LEN Coins = 🎮 15 Robux**`,
        inline: true,
      },
      {
        name:  "🛒 How to Buy",
        value: `\`/shop\` then \`/buy <package>\``,
        inline: true,
      }
    )
    .setFooter({ text: `Last updated by ${updatedBy?.username ?? "Admin"} • LEN Coin Store` })
    .setTimestamp();
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function cmdAddCoins(i) {
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  db.addCoins(target.id, target.username, amount);
  return i.reply({ embeds: [adminEmbed(`✅ Added **${formatCoins(amount)}** to **${target.username}**.\nNew balance: **${formatCoins(db.getUser(target.id).balance)}**`)] });
}

async function cmdRemoveCoins(i) {
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  db.removeCoins(target.id, amount);
  return i.reply({ embeds: [adminEmbed(`✅ Removed **${formatCoins(amount)}** from **${target.username}**.\nNew balance: **${formatCoins(db.getUser(target.id).balance)}**`)] });
}

async function cmdSetCoins(i) {
  const target = i.options.getUser("user");
  const amount = i.options.getInteger("amount");
  db.setCoins(target.id, target.username, amount);
  return i.reply({ embeds: [adminEmbed(`✅ Set **${target.username}**'s balance to **${formatCoins(amount)}**`)] });
}

async function cmdAddItem(i) {
  const name  = i.options.getString("name");
  const price = i.options.getInteger("price");
  const desc  = i.options.getString("description");
  const emoji = i.options.getString("emoji") || "📦";
  const stock = i.options.getInteger("stock") ?? -1;
  db.addShopItem({ name, price, description: desc, emoji, stock });
  return i.reply({ embeds: [adminEmbed(`✅ Added **${emoji} ${name}** — **${formatCoins(price)}** (Stock: ${stock === -1 ? "∞" : stock})`)] });
}

async function cmdRemoveItem(i) {
  const name    = i.options.getString("name").toLowerCase();
  const removed = db.removeShopItem(name);
  if (!removed) return i.reply({ content: "❌ Item not found.", ephemeral: true });
  return i.reply({ embeds: [adminEmbed(`✅ Removed **${name}** from the shop.`)] });
}

async function cmdGiveItem(i) {
  const target   = i.options.getUser("user");
  const itemName = i.options.getString("item");
  db.addToInventory(target.id, itemName);
  return i.reply({ embeds: [adminEmbed(`✅ Gave **${itemName}** to **${target.username}**.`)] });
}

async function cmdResetDaily(i) {
  const target = i.options.getUser("user");
  db.setLastDaily(target.id, 0);
  return i.reply({ embeds: [adminEmbed(`✅ Reset daily cooldown for **${target.username}**.`)] });
}

function adminEmbed(desc) {
  return new EmbedBuilder()
    .setColor(0x7289da)
    .setTitle("🔧 Admin Action")
    .setDescription(desc)
    .setTimestamp();
}

// ══════════════════════════════════════════════════════════════════════════════
//  BLACKJACK HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function buildDeck() {
  const suits = ["♠","♥","♦","♣"];
  const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const deck  = [];
  for (const suit of suits)
    for (const rank of ranks) {
      const value = rank === "A" ? 11 : ["J","Q","K"].includes(rank) ? 10 : parseInt(rank);
      deck.push({ display: `${rank}${suit}`, value, rank });
    }
  for (let n = deck.length - 1; n > 0; n--) {
    const k = Math.floor(Math.random() * (n + 1));
    [deck[n], deck[k]] = [deck[k], deck[n]];
  }
  return deck;
}

function drawCard(deck) { return deck.pop(); }

function handValue(hand) {
  let total = hand.reduce((s, c) => s + c.value, 0);
  let aces  = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function handStr(hand) { return hand.map((c) => c.display).join(" "); }

// ─── Boot ─────────────────────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
  client.user.setActivity("LEN Coin Economy | /shop", { type: 3 });
});

client.login(process.env.DISCORD_TOKEN);
