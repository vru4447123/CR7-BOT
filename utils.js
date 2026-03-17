const COIN_EMOJI = "<:Coin:1483370941583982612>";

function formatCoins(amount) {
  return `<:Coin:1483370941583982612> **${amount.toLocaleString()} LEN**`;
}

module.exports = { COIN_EMOJI, formatCoins };
