const COIN_EMOJI = "🪙";

function formatCoins(amount) {
  return `🪙 **${amount.toLocaleString()} LEN**`;
}

module.exports = { COIN_EMOJI, formatCoins };
