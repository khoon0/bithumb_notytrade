//ENTRY =
// 1)MARKET BUY ORDER
//EXIT =
// 1) FIXED SELL %
// 3) OCO - FIXED SELL AND STOP LOSS %

const { log, error } = console;
const binance = require('./binance');
const NP = require('number-precision');
NP.enableBoundaryChecking(false);
const scientificToDecimal = require('scientific-to-decimal');
const axios = require("axios");
const moment = require("moment");

const { XCoinAPI } = require("./bithumb")

const TelegramBot = require('node-telegram-bot-api');

const token = '6911116328:AAEl5IMLzMBwonhs9_T9-7C2Z7hicihibSY';

const bot = new TelegramBot(token, {polling: true});

// polling_error 이벤트 핸들러 추가
bot.on('polling_error', () => {});

let isCancelled = false;
let isSellInProgress = false;

bot.onText(/\/cancel/, (msg, match) => {
  const chatId = msg.chat.id;
  if (isSellInProgress) {
    isCancelled = true;
    bot.sendMessage(chatId, `Sell operation cancelled.`);
  } else {
    bot.sendMessage(chatId, `No sell operation in progress.`);
  }
});

let eInfo = {};

const loadeInfo = async ({ symbol }) => {
  try {
    let eInfo = {};
    const resp = await binance({
      method: 'GET',
      path: '/api/v3/exchangeInfo',
    });
    if (resp?.statusCode !== 200) throw resp;
    const einfoSymbol = resp.body.symbols.find((s) => s?.symbol === symbol);
    if (!einfoSymbol) throw 'Symbol missing in Exchange Info API';
    eInfo[symbol] = { ...einfoSymbol };
    return eInfo;
  } catch (err) {
    throw err;
  }
};

const getQty = ({ symbol, price, usdt }) => {
  const qty = usdt / price;
  const qstep = Math.log10(1 / eInfo[symbol]['filters'][1]['stepSize']);
  return NP.strip(Math.floor(qty * 10 ** qstep) / 10 ** qstep);
};

const buy = async ({ keys, symbol, usdt }) => {
  try {
    const resp = await binance({
      method: 'POST',
      path: '/api/v3/order',
      keys,
      params: {
        // quantity: scientificToDecimal(qty),
        symbol,
        side: 'BUY',
        type: 'MARKET',
        newOrderRespType: 'FULL',
        quoteOrderQty: usdt,
      },
    });

    if (resp?.statusCode !== 200) {
      console.error(`Error: ${resp.statusCode}. Full response: ${JSON.stringify(resp)}`);
      throw resp;
    }

    return resp.body;
  } catch (err) {
    console.error(`Error occurred while buying: ${err.message}`);
    throw err;
  }
};

const sell = async ({ keys, symbol, qty, timegap, immediate = false }) => {
  let timerId;
  let countdown = immediate ? 0 : timegap; //time constant

  isSellInProgress = true;

  let cancel = new Promise((resolve, reject) => {
    timerId = setInterval(() => {
      if (countdown <= 1) {
        clearInterval(timerId);
      } else {
        console.log(`Selling ${symbol} in ${--countdown} seconds...`);
      }

      if (isCancelled) {
        clearInterval(timerId);
        reject(new Error('Sell operation cancelled.'));
      }
    }, 1000);
  });

  try {
    if (!immediate) {
      await Promise.race([cancel, new Promise(resolve => setTimeout(resolve, timegap * 1000))]);
    }

    if (isCancelled) {
      throw new Error('Sell operation cancelled.');
    }

    const resp = await binance({
      method: 'POST',
      path: '/api/v3/order',
      keys,
      params: {
        quantity: scientificToDecimal(qty),
        symbol,
        side: 'SELL',
        type: 'MARKET',
        newOrderRespType: 'FULL',
      },
    });

    if (resp?.statusCode !== 200) {
      console.error(`Error: ${resp.statusCode}. Full response: ${JSON.stringify(resp)}`);
      throw new Error(`Error occurred while selling: ${resp.statusCode}`);
    }

    const soldPrice = resp.body.fills.reduce((total, fill) => total + (+fill.price * fill.qty), 0) / resp.body.fills.reduce((total, fill) => total + (+fill.qty), 0);

    console.log(`Successfully sold ${qty} ${symbol} at an average price of ${soldPrice}.`);

    return { response: resp.body, quantity: qty };
  } catch (err) {
    clearInterval(timerId);
    if (err.message === 'Sell operation cancelled.') {
      isCancelled = false; // Reset isCancelled
      return { response: null, quantity: qty };
    } else {
      console.error(`Error occurred while selling: ${err.message}`);
      if (qty > 0) {
        console.log(`Reducing ${symbol} quantity by 1 and retrying sell operation...`);
        return sell({ keys, symbol, qty: qty - 1, immediate: true });
      } else {
        throw err;
      }
    }
  }
  finally {
    isSellInProgress = false; 
  }
};

const buyBithumb = async ({ keys, symbol, krw }) => {
  try {
    const bithumbApi = new XCoinAPI(keys.bithumb_key, keys.bithumb_sec)
    const resp1 = await axios.get(`https://api.bithumb.com/public/transaction_history/${symbol}_KRW`)
    const bidData = resp1.data.data.filter((e) => e.type === 'bid')
    const price = bidData[bidData.length - 1].price
    const qty = Math.floor(krw / price)
    // keys: { api, sec }, quantity, symbol
    const resp = await bithumbApi.xcoinApiCall('/trade/market_buy', {
      units: String(qty),
      order_currency: symbol,
      payment_currency: 'KRW',
    });
    return {
      qty, price
    };
  } catch (err) {
    throw err;
  }
};

function getTime() {
  return moment().tz("Asia/Seoul").format('YYYY.MM.DD hh:mm:ss.SSS A');
}


module.exports = { loadeInfo, getQty, buy, sell, buyBithumb };