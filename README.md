# ClaudeTrader-Pro — AI-Powered Automated Trading

> **Connect Claude AI to your crypto exchange and execute trades automatically.**  
> Build trading strategies from YouTube videos, run them 24/7 on a VPS, and log every trade for taxes.

![Claude AI](https://img.shields.io/badge/Claude-AI%20Trading-9b59b6?logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![BitGet](https://img.shields.io/badge/BitGet-Crypto%20Exchange-1f1f1f)
![TradingView](https://img.shields.io/badge/TradingView-MCP-2962FF?logo=tradingview&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🎯 Overview

**ClaudeTrader-Pro** is an automated trading bot that uses Claude AI to analyze market conditions and execute trades on your crypto exchange. It connects to TradingView for price data, checks strategy rules, and places orders through BitGet (or any supported exchange).

**Key capabilities:**
- 🤖 Claude AI reads your trading strategy and executes trades
- 📊 Live price data from TradingView charts or Binance API
- ✅ Safety checks — every condition must pass before trading
- 💰 Automatic tax accounting (trades logged to CSV)
- ☁️ 24/7 cloud execution on a VPS
- 🔐 Secure API key management with environment variables

---

## ⚠️ Risk Disclaimer

**This is NOT financial advice.** Trading cryptocurrencies is extremely risky:
- You can lose 100% of your investment
- Past performance ≠ future results
- Always paper trade first
- Never invest more than you can afford to lose
- Test your strategy thoroughly before going live

**Use at your own risk.** The author is not responsible for losses.

---

## 📋 Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Building Your Own Strategy](#building-your-own-strategy)
- [Cloud Deployment](#cloud-deployment)
- [Trading Safety](#trading-safety)
- [Tax Accounting](#tax-accounting)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## 🔄 How It Works

The bot executes a single trade check on every run (usually via cron scheduling):

```
1. Bot starts → reads rules.json strategy
2. Fetches live price + indicators from TradingView or Binance
3. Calculates indicators (MACD, RSI, moving averages, etc.)
4. Evaluates market bias (bullish/bearish/neutral)
5. Checks ALL entry conditions from your strategy
6. If all pass → executes trade via exchange API
7. Logs trade to trades.csv with date, price, fees, net amount
8. Saves full decision log to safety-check-log.json
```

**If any condition fails:** Bot stops and tells you exactly which rule failed.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Claude AI Trading** | AI reads strategy rules and executes trades automatically |
| **Multi-Exchange** | BitGet, Binance, Bybit, OKX, Kraken, and 5+ others |
| **Safety Checks** | Every entry rule must pass — no exceptions |
| **Trade Limits** | Daily cap and max position size to control risk |
| **Paper Trading** | Test strategies without real money |
| **Tax Ready** | Every trade logged with fees for accountant |
| **Decision Logging** | Full audit trail of why each trade was/wasn't executed |
| **24/7 Cloud Mode** | Deploy to VPS and trade while you sleep |
| **Cron Scheduling** | Run on hourly, daily, or custom schedules |

---

## 🚀 Getting Started

### Prerequisites

- **Claude Code** — installed and running ([anthropic.com/claude](https://claude.ai))
- **Node.js 18+** — [install](https://nodejs.org/)
- **Crypto Exchange Account** — BitGet, Binance, Bybit, etc.
- **TradingView** — for local trading (VPS uses Binance free API)
- **Hostinger VPS** (optional) — for 24/7 trading (~$5/month)

### Step 1: Clone the Repository

```bash
git clone https://github.com/anonyemichael/ClaudeTrader-Pro.git
cd ClaudeTrader-Pro
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Add Your API Keys

Copy the template:
```bash
cp .env.example .env
```

Edit `.env` and add your exchange credentials:

```env
# BitGet (or your exchange)
BITGET_API_KEY=your_api_key_here
BITGET_SECRET_KEY=your_secret_here
BITGET_PASSPHRASE=your_passphrase_here

# Trading settings
PORTFOLIO_VALUE_USD=1000
MAX_TRADE_SIZE_USD=100
MAX_TRADES_PER_DAY=3

# Mode: paper or live
PAPER_TRADING=true

# Trading pair and timeframe
SYMBOL=BTCUSDT
TIMEFRAME=4H
```

**Getting your API key:** See guides in `docs/exchanges/` for BitGet, Binance, Bybit, OKX, and others.

### Step 4: Configure Your Trading Strategy

Edit `rules.json`:

```json
{
  "strategy_name": "MACD + RSI Momentum",
  "symbol": "BTCUSDT",
  "timeframe": "4H",
  "entry_rules": [
    {
      "name": "MACD Bullish Crossover",
      "type": "macd_cross",
      "value": "bullish"
    },
    {
      "name": "RSI Not Overbought",
      "type": "rsi_threshold",
      "operator": "<",
      "value": 70
    },
    {
      "name": "Price Above 200 MA",
      "type": "price_above_ma",
      "period": 200,
      "value": true
    }
  ],
  "exit_rules": [
    { "type": "take_profit", "percent": 5 },
    { "type": "stop_loss", "percent": 2 }
  ]
}
```

### Step 5: Test Locally (Paper Trading)

```bash
# Run a single check in paper trading mode
node bot.js
```

Watch the output — it should show:
- ✅ Indicators calculated
- ✅ Each rule evaluated
- ✅ Final decision (trade or skip)
- ✅ Log saved to `safety-check-log.json`

---

## ⚙️ Configuration

### Environment Variables (.env)

| Variable | Example | Description |
|----------|---------|-------------|
| `BITGET_API_KEY` | `your_key` | Exchange API key |
| `BITGET_SECRET_KEY` | `your_secret` | Exchange secret key |
| `BITGET_PASSPHRASE` | `your_pass` | Exchange passphrase (BitGet only) |
| `PORTFOLIO_VALUE_USD` | `1000` | Total account balance for position sizing |
| `MAX_TRADE_SIZE_USD` | `100` | Maximum USD per single trade |
| `MAX_TRADES_PER_DAY` | `3` | Stop trading after N trades today |
| `PAPER_TRADING` | `true` | Set to `false` for live trading |
| `SYMBOL` | `BTCUSDT` | Trading pair (base/quote) |
| `TIMEFRAME` | `4H` | Chart timeframe (1H, 4H, 1D, etc.) |

### Trading Rules (rules.json)

Define your strategy in plain JSON:

```json
{
  "entry_rules": [
    {
      "name": "Custom Rule Name",
      "type": "rsi_threshold",
      "operator": "<",
      "value": 30
    }
  ]
}
```

**Supported rule types:**
- `rsi_threshold` — RSI < or > value
- `macd_cross` — MACD bullish/bearish crossover
- `price_above_ma` — Price above/below moving average
- `trend_direction` — Market trending up/down
- `volatility_check` — Volatility high/low

---

## 🎓 Building Your Own Strategy

### Option 1: Use the Setup Wizard (Recommended)

Claude Code can build a strategy from any YouTube trader's transcripts:

1. Go to [Apify](https://apify.com) and search for "YouTube Transcript Scraper"
2. Scrape a trader's channel (takes 30 seconds)
3. Paste output into `prompts/01-extract-strategy.md`
4. Run that prompt in Claude Code
5. Claude generates a `rules.json` tailored to that trader

### Option 2: Manual Strategy Creation

Design your own rules:

1. Open `rules.json`
2. Add entry conditions (when to buy)
3. Add exit rules (take profit / stop loss)
4. Test in paper trading mode
5. Backtest on historical data (TradingView)
6. Deploy to live trading

Example strategy (Trend Following):

```json
{
  "strategy_name": "Simple Trend Following",
  "entry_rules": [
    { "name": "Price Above 50 MA", "type": "price_above_ma", "period": 50 },
    { "name": "Price Above 200 MA", "type": "price_above_ma", "period": 200 },
    { "name": "RSI < 70", "type": "rsi_threshold", "operator": "<", "value": 70 }
  ],
  "exit_rules": [
    { "type": "take_profit", "percent": 3 },
    { "type": "stop_loss", "percent": 1 }
  ]
}
```

---

## ☁️ Cloud Deployment (24/7 Trading)

Run the bot 24/7 on a VPS (even when your laptop is closed):

### Step 1: Get a VPS

Hostinger cheapest KVM (~$5/month): [hostinger.com](https://hostinger.com)

Once provisioned, you'll get IP and root password.

### Step 2: SSH into VPS

```bash
ssh root@YOUR_VPS_IP
```

### Step 3: Install Node.js

```bash
apt update && apt install -y nodejs npm git
```

### Step 4: Deploy the Bot

```bash
git clone https://github.com/anonyemichael/ClaudeTrader-Pro.git bot
cd bot
npm install
cp .env.example .env
# Edit .env with your API keys
nano .env
```

### Step 5: Set Cron Schedule

The bot runs one check and exits, so use cron for scheduling:

```bash
crontab -e
```

Add one line matching your chart timeframe:

```cron
# For 4H chart: run every 4 hours
0 */4 * * * cd /root/bot && /usr/bin/node bot.js >> bot.log 2>&1

# For 1D chart: run once daily at 9 AM UTC
0 9 * * * cd /root/bot && /usr/bin/node bot.js >> bot.log 2>&1

# For 1H chart: run every hour
0 * * * * cd /root/bot && /usr/bin/node bot.js >> bot.log 2>&1
```

### Step 6: Test & Monitor

```bash
# Watch logs in real-time
tail -f bot.log

# Check if bot ran this morning
grep "Trade Executed" bot.log | tail -5
```

---

## 🔐 Trading Safety

### Always Paper Trade First

Before going live:
1. Set `PAPER_TRADING=true` in `.env`
2. Run the bot for 7+ days
3. Verify decision logic matches your expectations
4. Check no unexpected trades are triggered
5. Only then switch to `PAPER_TRADING=false`

### Safety Checks Built In

Every trade must pass:
- ✅ All entry conditions from `rules.json`
- ✅ Position size < `MAX_TRADE_SIZE_USD`
- ✅ Daily trades < `MAX_TRADES_PER_DAY`
- ✅ Portfolio value check (1% risk rule)

### If Anything Fails

The bot:
1. Stops immediately (no trade)
2. Logs exact reason to `safety-check-log.json`
3. Shows you the actual values vs. expected

Example log:
```json
{
  "timestamp": "2026-07-14T09:00:00Z",
  "decision": "SKIP - Rule Failed",
  "failed_rule": "RSI < 70",
  "actual_value": 75,
  "expected": "< 70"
}
```

---

## 💰 Tax Accounting

Every executed trade is logged to `trades.csv`:

| Date | Time | Symbol | Side | Quantity | Price | Total USD | Fee | Net Amount | Order ID |
|------|------|--------|------|----------|-------|-----------|-----|------------|----------|
| 2026-07-14 | 09:15 | BTCUSDT | BUY | 0.025 | 43000 | 1075 | 2.15 | 1072.85 | 123456 |
| 2026-07-15 | 14:30 | BTCUSDT | SELL | 0.025 | 44100 | 1102.5 | 2.21 | 1100.29 | 123457 |

**Hand to your accountant at tax time** — they'll calculate gains/losses.

Generate quick tax summary:
```bash
node bot.js --tax-summary
```

Output:
```
Total Trades: 42
Volume: $52,400
Fees Paid: $105.20
Net P&L: +$2,150
```

---

## 🐛 Troubleshooting

### Bot Won't Connect to Exchange

**Issue:** API key error or connection refused.

**Solution:**
1. Check API key and secret are correct (copy-paste carefully)
2. Verify IP whitelist on exchange includes your VPS IP
3. Check exchange API is online (`curl https://api.exchange.com/health`)
4. Check `.env` file exists and is readable

### Rules Not Triggering

**Issue:** Bot runs but never trades.

**Solution:**
1. Check `rules.json` syntax (must be valid JSON)
2. Run in paper mode and check `safety-check-log.json`
3. Verify rule names match actual indicators
4. Check indicator values with `node bot.js --debug`

### VPS Bot Never Runs

**Issue:** Cron job doesn't execute.

**Solution:**
1. Check cron is running: `sudo systemctl status cron`
2. Verify correct time with: `date`
3. Check cron log: `grep CRON /var/log/syslog`
4. Ensure full path to `node` in cron: `/usr/bin/node`

### Account Gets Liquidated

**Issue:** Losses exceeded stop loss.

**Solution:**
1. Lower `MAX_TRADE_SIZE_USD`
2. Increase stop loss percentage
3. Reduce `MAX_TRADES_PER_DAY`
4. Review strategy for better entry points

---

## 📚 Resources

- [Claude Documentation](https://docs.anthropic.com/claude)
- [TradingView MCP](https://github.com/jackson-video-resources/tradingview-mcp-jackson)
- [BitGet API Docs](https://www.bitget.com/api-docs)
- [Apify YouTube Scraper](https://apify.com)
- [Cron Syntax](https://crontab.guru/)

---

## 📝 Contributing

Contributions welcome! Ideas:
- [ ] Support for options trading
- [ ] Machine learning strategy optimization
- [ ] Live dashboard for monitoring trades
- [ ] Telegram notifications
- [ ] Database persistence
- [ ] Multi-pair support

---

## 📄 License

MIT License — use freely.

© 2026 **Anonye Michael Ayinterima**. All rights reserved.

---

## 👨‍💼 Author

**Anonye Michael Ayinterima**  
*Computer Engineering Student at UENR*  
*Software Engineer & Automated Trading Enthusiast*

- **GitHub**: [@anonyemichael](https://github.com/anonyemichael)
- **LinkedIn**: [Anonye Michael](https://linkedin.com/in/anonye-michael-39112437b)
- **Email**: anonyemichael6@gmail.com

---

## ⚖️ Disclaimer

**This is not financial advice.** Trading cryptocurrencies involves substantial risk of loss. Past performance is not indicative of future results. Only trade with capital you can afford to lose. The author assumes no responsibility for losses incurred through use of this software.

---

**Trade smart. Risk responsibly. 🚀**
