const Bot = require("@broid/kit");
const BroidSkype = require("@broid/skype");

const bot = new Bot({
  logLevel: "info",
  http: {
    host: "0.0.0.0",
    port: 8080,
  }
});

bot.use(new BroidSkype({
  token: '...',
  tokenSecret: '...',
  logLevel: "info",
}));

bot.hear('ping.*', 'Person')
  .subscribe((message) => bot.sendText("pong", message.raw));
