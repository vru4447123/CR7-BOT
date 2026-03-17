# 🪙 LEN Coin Bot — v2

Discord economy bot with LEN Coins, Robux shop, gambling, and inventory.

---

## 🚀 Quick Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# → Fill in DISCORD_TOKEN and CLIENT_ID

# 3. Start the bot
npm start
```

**Required Privileged Intents** (Discord Dev Portal → Bot):
- ✅ Server Members Intent
- ✅ Message Content Intent

**Bot Permissions for invite:** `Send Messages`, `Embed Links`, `Read Message History`

---

## 💱 Robux Rate

> **100 LEN Coins = 15 Robux**

| Package  | LEN Coins | Robux |
|----------|-----------|-------|
| Robux S  | 100       | 15 R$ |
| Robux M  | 300       | 45 R$ |
| Robux L  | 700       | 105 R$ |
| Robux XL | 1,500     | 225 R$ |

---

## 📋 Commands

### 💰 Economy
| Command | Description |
|---|---|
| `/balance [user]` | Check LEN Coin balance |
| `/daily` | Claim 100 free LEN Coins (24h cooldown) |
| `/pay <user> <amount>` | Send coins to another user |
| `/leaderboard` | Top 10 richest users |

### 🎰 Gambling
| Command | Description |
|---|---|
| `/coinflip <heads\|tails> <bet>` | 50/50 — win 2x or lose |
| `/slots <bet>` | Slot machine (up to 20x jackpot) |
| `/blackjack <bet>` | Interactive Blackjack with Hit/Stand/Double Down |

### 🛒 Shop & Inventory
| Command | Description |
|---|---|
| `/shop` | View all Robux packages |
| `/buy <package>` | Purchase a Robux package |
| `/inventory [user]` | View your inventory |
| `/use <item>` | Redeem an item (notifies staff) |

### 📦 Robux Stock *(Admin)*
| Command | Description |
|---|---|
| `/show-stock <channel> <robux>` | Post or auto-update the stock embed |

The stock embed shows **STOCK → ROBUX → amount** and auto-updates when you run the command again in the same channel.

### 🔧 Admin *(Requires Manage Server)*
| Command | Description |
|---|---|
| `/addcoins <user> <n>` | Add coins |
| `/removecoins <user> <n>` | Remove coins |
| `/setcoins <user> <n>` | Set exact balance |
| `/additem <name> <price> <desc> [emoji] [stock]` | Add custom shop item |
| `/removeitem <name>` | Remove custom shop item |
| `/giveitem <user> <item>` | Give item directly |
| `/resetdaily <user>` | Reset daily cooldown |

---

## 🪙 Earning Coins

| Source | Amount |
|---|---|
| Sending a message | +1 LEN (5s cooldown) |
| `/daily` | +100 LEN (24h cooldown) |
| Gambling wins | Varies |

---

## 🎰 Slot Payouts

| Result | Multiplier |
|---|---|
| Two of a kind | 1.5× |
| Three of a kind | 3× |
| Three ⭐ | 5× |
| Three 💎 | 10× |
| Three 7️⃣ | **20× JACKPOT** |
