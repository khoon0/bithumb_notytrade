require('dotenv').config();
const { log, error } = console;
const { detectE, startWS } = require('./detect');
const { startBithumbDetectPC ,startBithumbDetectMobile } = require('./detectNotice');
const { loadeInfo, getQty, buy, sell, buyBithumb } = require('./order');
const validate = require('./validate');
const axios = require('axios');
const moment = require('moment');
require('moment-timezone');

const { is_test, bithumb_key, bithumb_sec, krw} = process.env;
const discordWebhookUrl = 'https://discord.com/api/webhooks/1193042585430786088/1pxsYW9AkUv9obpcVd3mmdtIySNX9HyhyLlQclOsVYvGJ1gOkH_az4ToHuKS4uT8GzOq';

log(`Notice notifying bot is running... ${getTime()}\nKRW : ₩${krw}\nTEST MODE : ${is_test}`);
axios.post(discordWebhookUrl, {
  content: `Notice notifying bot is running... ${getTime()}\nKRW : ₩${krw}\nTEST MODE : ${is_test}`
})
.catch(err => {
  console.error('Error sending Discord notification', err);
});

log('The bot is waiting for a new coin to be listed and search if the coin is listed in Binance USDT market.');
log('When detected, the bot automatically trades as per the configuration.');

// startWS(); //이거는 바이낸스 신규 상장 감지
startBithumbDetectPC();
startBithumbDetectMobile();
detectE.on('NEWLISTING', async (data) => {
  try {
    const nStart = new Date().getTime();
    const { s: symbol, c: closePrice, type } = { ...data };
    log(`Symbol ${symbol} detected in notification ${getTime()}`);

    axios.post(discordWebhookUrl, {
      content: `Symbol ${symbol} detected in notification ${getTime()}`
    })
    .catch(err => {
      console.error('Error sending Discord notification', err);
    });

    const bresp = await buyBithumb({ keys: { bithumb_key, bithumb_sec }, krw, symbol })

    const nEnd =  new Date().getTime();
    const nDiff = nEnd - nStart
    log(`Time gap: ${nDiff}ms`)

    const buyPrice = bresp.price;
    const qty = bresp.qty;
    log(`${symbol} buy price is ${buyPrice} and buy quantity is ${qty} at ${getTime()}`);

    axios.post(discordWebhookUrl, {
      content: `${symbol} buy price is ${buyPrice} and buy quantity is ${qty} at ${getTime()}`
    })
    .catch(err => {
      console.error('Error sending Discord notification', err);
    });

  } catch (err) {
    log(err, getTime());
    axios.post(discordWebhookUrl, {
      content: `Error Buying New Coin: ${err.message}`
    })
        .catch(() => {
          console.error('Error sending Discord notification');
        });
  }
});

process.on('SIGINT', () => {
  axios.post(discordWebhookUrl, {
    content: `Process was interrupted at ${getTime()}`
  })
  .catch(err => {
    console.error('Error sending Discord notification', err);
  });
  process.exit(1);
});

process.on('exit', (code) => {
  axios.post(discordWebhookUrl, {
    content: `Process exited with code: ${code} at ${getTime()}`
  })
  .catch(err => {
    console.error('Error sending Discord notification', err);
  });
});

process.on('uncaughtException', (err) => {
  axios.post(discordWebhookUrl, {
    content: `Process terminated due to uncaught exception: ${err.message} at ${getTime()}`
  })
  .catch(error => {
    console.error('Error sending Discord notification', error);
  });
});

function getTime() {
  return moment().tz("Asia/Seoul").format('YYYY.MM.DD hh:mm:ss.SSS A');
}
