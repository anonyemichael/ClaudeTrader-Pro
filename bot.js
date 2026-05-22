/**
 * Claude + TradingView MCP — Automated Trading Bot
 *
 * Dual-mode: crypto (BitGet or Binance) or forex (OANDA).
 * Switch by setting MARKET_TYPE=crypto or MARKET_TYPE=forex in .env.
 *
 * Local mode: node bot.js
 * Cloud mode: deploy to Railway/Hostinger, set env vars, trigger on cron schedule
 */

import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import crypto from "crypto";

// ─── Config ──────────────────────────────────────────────────────────────────

const CONFIG = {
  marketType: process.env.MARKET_TYPE || "crypto",   // "crypto" or "forex"
  exchange: process.env.EXCHANGE || "bybit",            // "bybit", "bitget", or "binance" (crypto only)
  symbol: process.env.SYMBOL || "BTCUSDT",
  timeframe: process.env.TIMEFRAME || "4H",
  portfolioValue: parseFloat(process.env.PORTFOLIO_VALUE_USD || "1000"),
  maxTradeSizeUSD: parseFloat(process.env.MAX_TRADE_SIZE_USD || "50"),
  maxTradesPerDay: parseInt(process.env.MAX_TRADES_PER_DAY || "3"),
  paperTrading: process.env.PAPER_TRADING !== "false",
  tradeMode: process.env.TRADE_MODE || "spot",
  bybit: {
    apiKey: process.env.BYBIT_API_KEY,
    secretKey: process.env.BYBIT_SECRET_KEY,
  },
  bitget: {
    apiKey: process.env.BITGET_API_KEY,
    secretKey: process.env.BITGET_SECRET_KEY,
    passphrase: process.env.BITGET_PASSPHRASE,
    baseUrl: process.env.BITGET_BASE_URL || "https://api.bitget.com",
  },
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    secretKey: process.env.BINANCE_SECRET_KEY,
  },
  oanda: {
    apiKey: process.env.OANDA_API_KEY,
    accountId: process.env.OANDA_ACCOUNT_ID,
    practice: process.env.OANDA_PRACTICE !== "false",
  },
};

const LOG_FILE = "safety-check-log.json";

// ─── Onboarding ───────────────────────────────────────────────────────────────

function checkOnboarding() {
  let required = [];

  if (CONFIG.marketType === "forex") {
    required = ["OANDA_API_KEY", "OANDA_ACCOUNT_ID"];
  } else if (CONFIG.exchange === "bybit") {
    required = ["BYBIT_API_KEY", "BYBIT_SECRET_KEY"];
  } else if (CONFIG.exchange === "binance") {
    required = ["BINANCE_API_KEY", "BINANCE_SECRET_KEY"];
  } else {
    required = ["BITGET_API_KEY", "BITGET_SECRET_KEY", "BITGET_PASSPHRASE"];
  }

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.log(`\n⚠️  Missing credentials in .env: ${missing.join(", ")}`);
    console.log("Add the missing values then re-run: node bot.js\n");
    process.exit(0);
  }

  const csvPath = new URL("trades.csv", import.meta.url).pathname;
  console.log(`\n📄 Trade log: ${csvPath}`);
  console.log(
    `   Open in Google Sheets or Excel any time.\n`
  );
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function loadLog() {
  if (!existsSync(LOG_FILE)) return { trades: [] };
  return JSON.parse(readFileSync(LOG_FILE, "utf8"));
}

function saveLog(log) {
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function countTodaysTrades(log) {
  const today = new Date().toISOString().slice(0, 10);
  return log.trades.filter(
    (t) => t.timestamp.startsWith(today) && t.orderPlaced
  ).length;
}

// ─── Market Data ──────────────────────────────────────────────────────────────

async function fetchCandles(symbol, interval, limit = 500) {
  if (CONFIG.marketType === "forex") {
    return fetchOandaCandles(symbol, interval, limit);
  }
  return fetchBinanceCandles(symbol, interval, limit);
}

// Binance public API — free, no auth needed
async function fetchBinanceCandles(symbol, interval, limit) {
  const intervalMap = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w",
  };
  const binanceInterval = intervalMap[interval] || "1m";
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`);
  const data = await res.json();
  return data.map((k) => ({
    time: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

// OANDA candles — requires API key (practice or live)
async function fetchOandaCandles(instrument, interval, limit) {
  const baseUrl = CONFIG.oanda.practice
    ? "https://api-fxpractice.oanda.com"
    : "https://api-fxtrade.oanda.com";

  const granularity = oandaGranularity(interval);
  const url = `${baseUrl}/v3/instruments/${instrument}/candles?count=${limit}&granularity=${granularity}&price=M`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${CONFIG.oanda.apiKey}` },
  });
  if (!res.ok) throw new Error(`OANDA API error: ${res.status}`);
  const data = await res.json();

  return data.candles
    .filter((c) => c.complete)
    .map((c) => ({
      time: new Date(c.time).getTime(),
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: c.volume,
    }));
}

function oandaGranularity(interval) {
  const map = {
    "1m": "M1", "5m": "M5", "15m": "M15", "30m": "M30",
    "1H": "H1", "4H": "H4", "1D": "D", "1W": "W",
  };
  return map[interval] || "H4";
}

// ─── Indicator Calculations ───────────────────────────────────────────────────

function calcEMA(closes, period) {
  const multiplier = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier);
  }
  return ema;
}

// Swing highs and lows: a swing high/low must be the extreme within `lookback` candles on each side
function detectSwingPoints(candles, lookback = 3) {
  const swingHighs = [];
  const swingLows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    const leftHighs = candles.slice(i - lookback, i).map((x) => x.high);
    const rightHighs = candles.slice(i + 1, i + lookback + 1).map((x) => x.high);
    const leftLows = candles.slice(i - lookback, i).map((x) => x.low);
    const rightLows = candles.slice(i + 1, i + lookback + 1).map((x) => x.low);
    if (c.high > Math.max(...leftHighs) && c.high > Math.max(...rightHighs)) {
      swingHighs.push({ index: i, price: c.high, time: c.time });
    }
    if (c.low < Math.min(...leftLows) && c.low < Math.min(...rightLows)) {
      swingLows.push({ index: i, price: c.low, time: c.time });
    }
  }
  return { swingHighs, swingLows };
}

// Market structure: HH+HL = bullish, LH+LL = bearish, else neutral
function analyzeMarketStructure(swingHighs, swingLows) {
  if (swingHighs.length < 2 || swingLows.length < 2) {
    return { bias: "neutral", reason: "Not enough swing points to determine structure" };
  }
  const [prevHigh, lastHigh] = swingHighs.slice(-2);
  const [prevLow, lastLow] = swingLows.slice(-2);
  const higherHighs = lastHigh.price > prevHigh.price;
  const higherLows = lastLow.price > prevLow.price;
  const lowerHighs = lastHigh.price < prevHigh.price;
  const lowerLows = lastLow.price < prevLow.price;
  if (higherHighs && higherLows) {
    return {
      bias: "bullish",
      reason: `HH ${lastHigh.price.toFixed(2)} > ${prevHigh.price.toFixed(2)}, HL ${lastLow.price.toFixed(2)} > ${prevLow.price.toFixed(2)}`,
      lastSwingHigh: lastHigh, lastSwingLow: lastLow,
      prevSwingHigh: prevHigh, prevSwingLow: prevLow,
    };
  }
  if (lowerHighs && lowerLows) {
    return {
      bias: "bearish",
      reason: `LH ${lastHigh.price.toFixed(2)} < ${prevHigh.price.toFixed(2)}, LL ${lastLow.price.toFixed(2)} < ${prevLow.price.toFixed(2)}`,
      lastSwingHigh: lastHigh, lastSwingLow: lastLow,
      prevSwingHigh: prevHigh, prevSwingLow: prevLow,
    };
  }
  return { bias: "neutral", reason: "Mixed structure — no clear HH/HL or LH/LL" };
}

// Break & retest: price broke a key level then pulled back within 0.5% of it
function detectBreakAndRetest(candles, structure) {
  const recent = candles.slice(-10);
  const current = candles[candles.length - 1];
  const tolerance = 0.005;
  if (structure.bias === "bullish" && structure.prevSwingHigh) {
    const level = structure.prevSwingHigh.price;
    const broke = recent.some((c) => c.close > level);
    const retesting = Math.abs(current.close - level) / level < tolerance;
    return { detected: broke && retesting, level };
  }
  if (structure.bias === "bearish" && structure.prevSwingLow) {
    const level = structure.prevSwingLow.price;
    const broke = recent.some((c) => c.close < level);
    const retesting = Math.abs(current.close - level) / level < tolerance;
    return { detected: broke && retesting, level };
  }
  return { detected: false, level: null };
}

// Candlestick confirmation: bullish/bearish engulfing or pin bar
function detectCandleSignal(current, prev) {
  const currBody = Math.abs(current.close - current.open);
  const currRange = current.high - current.low;
  const isBullish = current.close > current.open;
  const isBearish = current.close < current.open;
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const upperWick = current.high - Math.max(current.open, current.close);
  const bullishEngulfing = isBullish &&
    current.open <= Math.min(prev.open, prev.close) &&
    current.close >= Math.max(prev.open, prev.close);
  const bearishEngulfing = isBearish &&
    current.open >= Math.max(prev.open, prev.close) &&
    current.close <= Math.min(prev.open, prev.close);
  const bullishPin = currRange > 0 && lowerWick >= 2 * currBody && lowerWick > upperWick;
  const bearishPin = currRange > 0 && upperWick >= 2 * currBody && upperWick > lowerWick;
  return {
    bullish: bullishEngulfing || bullishPin,
    bearish: bearishEngulfing || bearishPin,
    type: bullishEngulfing ? "bullish engulfing" : bullishPin ? "bullish pin bar" :
          bearishEngulfing ? "bearish engulfing" : bearishPin ? "bearish pin bar" : "no signal",
  };
}

// ─── Safety Check ─────────────────────────────────────────────────────────────

function runSafetyCheck(price, ema50, structure, candleSignal, breakRetest) {
  const results = [];

  const check = (label, required, actual, pass) => {
    results.push({ label, required, actual, pass });
    console.log(`  ${pass ? "✅" : "🚫"} ${label}`);
    console.log(`     Required: ${required} | Actual: ${actual}`);
  };

  console.log("\n── Safety Check (@jacktradessss Price Action) ────────────\n");
  console.log(`  Market Structure: ${structure.bias.toUpperCase()} — ${structure.reason}\n`);

  if (structure.bias === "bullish") {
    console.log("  Checking LONG entry conditions...\n");
    check("Bullish market structure (HH + HL)", "HH and HL confirmed", structure.reason, true);
    check("Price above EMA(50) — trend confluence", `> ${ema50.toFixed(2)}`, price.toFixed(2), price > ema50);
    check(
      "Break and retest of key swing level",
      "Price within 0.5% of broken swing high",
      breakRetest.detected ? `Retesting ${breakRetest.level?.toFixed(2)}` : "No retest detected",
      breakRetest.detected
    );
    check(
      "Candlestick confirmation at retest",
      "Bullish engulfing or pin bar",
      candleSignal.type,
      candleSignal.bullish
    );
  } else if (structure.bias === "bearish") {
    console.log("  Checking SHORT entry conditions...\n");
    check("Bearish market structure (LH + LL)", "LH and LL confirmed", structure.reason, true);
    check("Price below EMA(50) — trend confluence", `< ${ema50.toFixed(2)}`, price.toFixed(2), price < ema50);
    check(
      "Break and retest of key swing level",
      "Price within 0.5% of broken swing low",
      breakRetest.detected ? `Retesting ${breakRetest.level?.toFixed(2)}` : "No retest detected",
      breakRetest.detected
    );
    check(
      "Candlestick confirmation at retest",
      "Bearish engulfing or pin bar",
      candleSignal.type,
      candleSignal.bearish
    );
  } else {
    console.log("  Bias: NEUTRAL — ranging market. No trade.\n");
    results.push({ label: "Market structure", required: "HH/HL or LH/LL", actual: structure.reason, pass: false });
  }

  const allPass = results.every((r) => r.pass);
  return { results, allPass, bias: structure.bias };
}

// ─── Trade Limits ─────────────────────────────────────────────────────────────

function checkTradeLimits(log) {
  const todayCount = countTodaysTrades(log);

  console.log("\n── Trade Limits ─────────────────────────────────────────\n");

  if (todayCount >= CONFIG.maxTradesPerDay) {
    console.log(`🚫 Max trades per day reached: ${todayCount}/${CONFIG.maxTradesPerDay}`);
    return false;
  }

  console.log(`✅ Trades today: ${todayCount}/${CONFIG.maxTradesPerDay} — within limit`);

  const tradeSize = Math.min(CONFIG.portfolioValue * 0.01, CONFIG.maxTradeSizeUSD);
  console.log(`✅ Trade size: $${tradeSize.toFixed(2)} — within max $${CONFIG.maxTradeSizeUSD}`);

  return true;
}

// ─── Order Execution ──────────────────────────────────────────────────────────

async function placeOrder(symbol, side, sizeUSD, price) {
  if (CONFIG.marketType === "forex") {
    return placeOandaOrder(symbol, side, sizeUSD, price);
  }
  if (CONFIG.exchange === "bybit") {
    return placeBybitOrder(symbol, side, sizeUSD);
  }
  if (CONFIG.exchange === "binance") {
    return placeBinanceOrder(symbol, side, sizeUSD, price);
  }
  return placeBitGetOrder(symbol, side, sizeUSD, price);
}

// Bybit V5 API — spot market order by quote currency (USD amount)
async function placeBybitOrder(symbol, side, sizeUSD) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const body = JSON.stringify({
    category: "spot",
    symbol,
    side: side === "buy" ? "Buy" : "Sell",
    orderType: "Market",
    qty: sizeUSD.toFixed(2),
    marketUnit: "quoteCoin",
  });
  const signStr = timestamp + CONFIG.bybit.apiKey + recvWindow + body;
  const signature = crypto
    .createHmac("sha256", CONFIG.bybit.secretKey)
    .update(signStr)
    .digest("hex");

  const res = await fetch("https://api.bybit.com/v5/order/create", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": CONFIG.bybit.apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
    body,
  });

  const data = await res.json();
  if (data.retCode !== 0) throw new Error(`Bybit order failed: ${data.retMsg}`);
  return { orderId: data.result.orderId };
}

// BitGet
function signBitGet(timestamp, method, path, body = "") {
  const message = `${timestamp}${method}${path}${body}`;
  return crypto
    .createHmac("sha256", CONFIG.bitget.secretKey)
    .update(message)
    .digest("base64");
}

async function placeBitGetOrder(symbol, side, sizeUSD, price) {
  const quantity = (sizeUSD / price).toFixed(6);
  const timestamp = Date.now().toString();
  const path =
    CONFIG.tradeMode === "spot"
      ? "/api/v2/spot/trade/placeOrder"
      : "/api/v2/mix/order/placeOrder";

  const body = JSON.stringify({
    symbol,
    side,
    orderType: "market",
    quantity,
    ...(CONFIG.tradeMode === "futures" && {
      productType: "USDT-FUTURES",
      marginMode: "isolated",
      marginCoin: "USDT",
    }),
  });

  const signature = signBitGet(timestamp, "POST", path, body);

  const res = await fetch(`${CONFIG.bitget.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ACCESS-KEY": CONFIG.bitget.apiKey,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": CONFIG.bitget.passphrase,
    },
    body,
  });

  const data = await res.json();
  if (data.code !== "00000") throw new Error(`BitGet order failed: ${data.msg}`);
  return { orderId: data.data.orderId };
}

// Binance
function signBinance(queryString) {
  return crypto
    .createHmac("sha256", CONFIG.binance.secretKey)
    .update(queryString)
    .digest("hex");
}

async function placeBinanceOrder(symbol, side, sizeUSD, price) {
  const timestamp = Date.now();
  const params = new URLSearchParams({
    symbol,
    side: side.toUpperCase(),
    type: "MARKET",
    quoteOrderQty: sizeUSD.toFixed(2),
    timestamp: timestamp.toString(),
    recvWindow: "5000",
  });
  const signature = signBinance(params.toString());
  params.append("signature", signature);

  const res = await fetch(`https://api.binance.com/api/v3/order?${params}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": CONFIG.binance.apiKey },
  });

  const data = await res.json();
  if (!data.orderId) throw new Error(`Binance order failed: ${data.msg}`);
  return { orderId: data.orderId.toString() };
}

// OANDA
async function placeOandaOrder(instrument, side, sizeUSD, price) {
  const baseUrl = CONFIG.oanda.practice
    ? "https://api-fxpractice.oanda.com"
    : "https://api-fxtrade.oanda.com";

  // Units: for EUR_USD at 1.08, spending $50 = ~46 units of EUR
  const units = Math.floor(sizeUSD / price);
  const signedUnits = side === "buy" ? units : -units;

  const body = JSON.stringify({
    order: {
      type: "MARKET",
      instrument,
      units: signedUnits.toString(),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
    },
  });

  const res = await fetch(
    `${baseUrl}/v3/accounts/${CONFIG.oanda.accountId}/orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.oanda.apiKey}`,
      },
      body,
    }
  );

  const data = await res.json();
  if (data.orderFillTransaction) {
    return { orderId: data.orderFillTransaction.id };
  }
  throw new Error(`OANDA order failed: ${JSON.stringify(data.errorMessage || data)}`);
}

// ─── Tax CSV Logging ──────────────────────────────────────────────────────────

const CSV_FILE = "trades.csv";
const CSV_HEADERS = [
  "Date", "Time (UTC)", "Exchange", "Market", "Symbol", "Side",
  "Quantity", "Price", "Total USD", "Fee (est.)", "Net Amount",
  "Order ID", "Mode", "Notes",
].join(",");

function initCsv() {
  if (!existsSync(CSV_FILE)) {
    const funnyNote = `,,,,,,,,,,,,,"NOTE","Hey, if you're at this stage of the video, you must be enjoying it... perhaps you could hit subscribe now? :)"`;
    writeFileSync(CSV_FILE, CSV_HEADERS + "\n" + funnyNote + "\n");
    console.log(`📄 Created ${CSV_FILE} — open in Google Sheets or Excel to track trades.`);
  }
}

function exchangeName() {
  if (CONFIG.marketType === "forex") return "OANDA";
  if (CONFIG.exchange === "bybit") return "Bybit";
  if (CONFIG.exchange === "binance") return "Binance";
  return "BitGet";
}

function writeTradeCsv(logEntry) {
  const now = new Date(logEntry.timestamp);
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);

  let side = "", quantity = "", totalUSD = "", fee = "", netAmount = "", orderId = "", mode = "", notes = "";

  if (!logEntry.allPass) {
    const failed = logEntry.conditions.filter((c) => !c.pass).map((c) => c.label).join("; ");
    mode = "BLOCKED";
    orderId = "BLOCKED";
    notes = `Failed: ${failed}`;
  } else if (logEntry.paperTrading) {
    side = "BUY";
    quantity = (logEntry.tradeSize / logEntry.price).toFixed(6);
    totalUSD = logEntry.tradeSize.toFixed(2);
    fee = (logEntry.tradeSize * 0.001).toFixed(4);
    netAmount = (logEntry.tradeSize - parseFloat(fee)).toFixed(2);
    orderId = logEntry.orderId || "";
    mode = "PAPER";
    notes = "All conditions met";
  } else {
    side = "BUY";
    quantity = (logEntry.tradeSize / logEntry.price).toFixed(6);
    totalUSD = logEntry.tradeSize.toFixed(2);
    fee = (logEntry.tradeSize * 0.001).toFixed(4);
    netAmount = (logEntry.tradeSize - parseFloat(fee)).toFixed(2);
    orderId = logEntry.orderId || "";
    mode = "LIVE";
    notes = logEntry.error ? `Error: ${logEntry.error}` : "All conditions met";
  }

  const row = [
    date, time, exchangeName(), CONFIG.marketType.toUpperCase(),
    logEntry.symbol, side, quantity, logEntry.price.toFixed(5),
    totalUSD, fee, netAmount, orderId, mode, `"${notes}"`,
  ].join(",");

  if (!existsSync(CSV_FILE)) writeFileSync(CSV_FILE, CSV_HEADERS + "\n");
  appendFileSync(CSV_FILE, row + "\n");
  console.log(`Tax record saved → ${CSV_FILE}`);
}

// Tax summary command: node bot.js --tax-summary
function generateTaxSummary() {
  if (!existsSync(CSV_FILE)) {
    console.log("No trades.csv found — no trades have been recorded yet.");
    return;
  }

  const lines = readFileSync(CSV_FILE, "utf8").trim().split("\n");
  const rows = lines.slice(1).map((l) => l.split(","));

  const live = rows.filter((r) => r[12] === "LIVE");
  const paper = rows.filter((r) => r[12] === "PAPER");
  const blocked = rows.filter((r) => r[12] === "BLOCKED");
  const totalVolume = live.reduce((sum, r) => sum + parseFloat(r[8] || 0), 0);
  const totalFees = live.reduce((sum, r) => sum + parseFloat(r[9] || 0), 0);

  console.log("\n── Tax Summary ──────────────────────────────────────────\n");
  console.log(`  Total decisions logged : ${rows.length}`);
  console.log(`  Live trades executed   : ${live.length}`);
  console.log(`  Paper trades           : ${paper.length}`);
  console.log(`  Blocked by safety check: ${blocked.length}`);
  console.log(`  Total volume (USD)     : $${totalVolume.toFixed(2)}`);
  console.log(`  Total fees paid (est.) : $${totalFees.toFixed(4)}`);
  console.log(`\n  Full record: ${CSV_FILE}`);
  console.log("─────────────────────────────────────────────────────────\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  checkOnboarding();
  initCsv();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Claude Trading Bot");
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  Market : ${CONFIG.marketType.toUpperCase()} | Exchange: ${exchangeName()}`);
  console.log(`  Mode   : ${CONFIG.paperTrading ? "📋 PAPER TRADING" : "🔴 LIVE TRADING"}`);
  console.log("═══════════════════════════════════════════════════════════");

  const rules = JSON.parse(readFileSync("rules.json", "utf8"));
  console.log(`\nStrategy : ${rules.strategy.name}`);
  console.log(`Symbol   : ${CONFIG.symbol} | Timeframe: ${CONFIG.timeframe}`);

  const log = loadLog();
  const withinLimits = checkTradeLimits(log);
  if (!withinLimits) {
    console.log("\nBot stopping — trade limits reached for today.");
    return;
  }

  console.log(`\n── Fetching market data (${CONFIG.marketType === "forex" ? "OANDA" : "Binance"}) ──────────────\n`);
  const candles = await fetchCandles(CONFIG.symbol, CONFIG.timeframe, 200);
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  console.log(`  Current price: ${price.toFixed(2)}`);

  if (candles.length < 50) {
    console.log("\n⚠️  Not enough candles to calculate EMA(50). Need at least 50. Exiting.");
    return;
  }

  const ema50 = calcEMA(closes, 50);
  const { swingHighs, swingLows } = detectSwingPoints(candles);
  const structure = analyzeMarketStructure(swingHighs, swingLows);
  const candleSignal = detectCandleSignal(candles[candles.length - 1], candles[candles.length - 2]);
  const breakRetest = detectBreakAndRetest(candles, structure);

  console.log(`  EMA(50)    : ${ema50.toFixed(2)}`);
  console.log(`  Structure  : ${structure.bias} — ${structure.reason}`);
  console.log(`  Candle     : ${candleSignal.type}`);
  console.log(`  Break+Retest: ${breakRetest.detected ? `Yes — ${breakRetest.level?.toFixed(2)}` : "No"}`);

  const { results, allPass, bias } = runSafetyCheck(price, ema50, structure, candleSignal, breakRetest);

  const tradeSize = Math.min(CONFIG.portfolioValue * 0.01, CONFIG.maxTradeSizeUSD);

  console.log("\n── Decision ─────────────────────────────────────────────\n");

  const logEntry = {
    timestamp: new Date().toISOString(),
    symbol: CONFIG.symbol,
    timeframe: CONFIG.timeframe,
    marketType: CONFIG.marketType,
    exchange: exchangeName(),
    price,
    indicators: { ema50, structure: structure.bias, structureReason: structure.reason, candleSignal: candleSignal.type, breakRetest: breakRetest.detected },
    conditions: results,
    allPass,
    tradeSize,
    orderPlaced: false,
    orderId: null,
    paperTrading: CONFIG.paperTrading,
    limits: {
      maxTradeSizeUSD: CONFIG.maxTradeSizeUSD,
      maxTradesPerDay: CONFIG.maxTradesPerDay,
      tradesToday: countTodaysTrades(log),
    },
  };

  if (!allPass) {
    const failed = results.filter((r) => !r.pass).map((r) => r.label);
    console.log(`🚫 TRADE BLOCKED`);
    console.log(`   Failed conditions:`);
    failed.forEach((f) => console.log(`   - ${f}`));
  } else {
    console.log(`✅ ALL CONDITIONS MET`);

    if (CONFIG.paperTrading) {
      console.log(`\n📋 PAPER TRADE — would buy ${CONFIG.symbol} ~$${tradeSize.toFixed(2)} at market`);
      console.log(`   (Set PAPER_TRADING=false in .env to place real orders)`);
      logEntry.orderPlaced = true;
      logEntry.orderId = `PAPER-${Date.now()}`;
    } else {
      console.log(`\n🔴 PLACING LIVE ORDER — $${tradeSize.toFixed(2)} BUY ${CONFIG.symbol} on ${exchangeName()}`);
      try {
        const order = await placeOrder(CONFIG.symbol, "buy", tradeSize, price);
        logEntry.orderPlaced = true;
        logEntry.orderId = order.orderId;
        console.log(`✅ ORDER PLACED — ${order.orderId}`);
      } catch (err) {
        console.log(`❌ ORDER FAILED — ${err.message}`);
        logEntry.error = err.message;
      }
    }
  }

  log.trades.push(logEntry);
  saveLog(log);
  console.log(`\nDecision log saved → ${LOG_FILE}`);
  writeTradeCsv(logEntry);

  console.log("═══════════════════════════════════════════════════════════\n");
}

if (process.argv.includes("--tax-summary")) {
  generateTaxSummary();
} else {
  run().catch((err) => {
    console.error("Bot error:", err);
    process.exit(1);
  });
}
