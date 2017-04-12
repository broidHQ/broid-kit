[npm]:https://img.shields.io/badge/npm-broid-green.svg?style=flat
[npm-url]:https://www.npmjs.com/org/broid

[node]:https://img.shields.io/node/v/@broid/broid-kit.svg
[node-url]:https://nodejs.org

[tests]:https://img.shields.io/travis/broidHQ/broid-kit/master.svg
[tests-url]:https://travis-ci.org/broidHQ/broid-kit

[bithound]:https://img.shields.io/bithound/code/github/broidHQ/broid-kit.svg
[bithound-url]:https://www.bithound.io/github/broidHQ/broid-kit

[bithoundscore]:https://www.bithound.io/github/broidHQ/broid-kit/badges/score.svg
[bithoundscore-url]:https://www.bithound.io/github/broidHQ/broid-kit

[nsp-checked]:https://img.shields.io/badge/nsp-checked-green.svg?style=flat
[nsp-checked-url]:https://nodesecurity.io

[gitter]:https://badges.gitter.im/broidHQ/broid.svg
[gitter-url]:https://t.broid.ai/c/Blwjlw?utm_source=github&utm_medium=readme&utm_campaign=top&link=gitter

[join-slack]:https://img.shields.io/badge/chat-on_slack-lightgrey.svg?style=flat
[join-slack-url]:http://slackin.broid.ai/

[![npm][npm]][npm-url]
[![node][node]][node-url]
[![tests][tests]][tests-url]
[![bithound][bithound]][bithound-url]
[![bithoundscore][bithoundscore]][bithoundscore-url]
[![nsp-checked][nsp-checked]][nsp-checked-url]

# Broid Kit

Broid Kit is thinked to make easy the creation of  creative bots that live inside messaging platforms. It is powered by [Broid Integrations](https://github.com/broidHQ/integrations/edit/master/README.md) which allow you to use the hight number of messanging plateforms thant any others framework.

> Connect your App to Multiple Messaging Channels with the W3C Open standard.

<br>
<p align="center">
<a href="https://github.com/broidHQ/integrations">
<img alt="Broid.ai" src="https://cloud.githubusercontent.com/assets/1795343/24925674/f7b23ee4-1ec6-11e7-9b11-37a978887b63.png">
</a>
</p>
<br>
<br>

[![gitter][gitter]][gitter-url] [![join-slack][join-slack]][join-slack-url]

# Quick Example

```javascript

const Bot = require("broid-kit");
const BroidDiscord = require("broid-discord");
const BroidMessenger = require("broid-messenger");
const BroidSlack = require("broid-slack");

const bot = new Bot({
  logLevel: "info",
  http: {
    host: "0.0.0.0",
    port: 8080,
  }
});

bot.use(new Broid-Slack(<...options>));
bot.use(new Broid-Discord(<...options>));
bot.use(new Broid-Messenger(<...options>));

// Listening for public starting by `hello`
  bot.hear("hello.*", "Group")
    .subscribe((data) => {
      console.log("Data:", JSON.stringify(data, null, 2));

      // Reply to the message
      bot.sendText("Hi, How are you?", data.raw);
    });
  ```

# Documentation

## WebHooks

Broid Kit provide an http server and create default webhook route when the integration need.
By default, the webhook path follow the naming: `webhook/<integration>`, integration is the name provide by the `getServiceName` method.

In case of `@broid/skype` the webhook route will be `/webhook/skype`.

## Receiving all messages

  ```javascript
  bot.on("Group")
    .subscribe((data) => {
      console.log("Data:", JSON.stringify(data, null, 2));

      // Reply to the message
      bot.sendText("i am listening all messages", data.raw);
    });
  ```

## Matching Patterns and Keywords

  ```javascript
bot.hears(["keyword", "hello.*"], "Group")
  .subscribe(data => {
    console.log("Data:", JSON.stringify(data, null, 2));
  });
```

## Node callback is supported

```javascript
bot.hear("hello.*", "Group", (message, error) => {
  console.log("Data:", JSON.stringify(data, null, 2));
});
```

```javascript
bot.hears(["keyword", "hello.*"], "Group", (message, error) => {
  console.log("Data:", JSON.stringify(data, null, 2));
});
```

## Send

### A simple message

```javascript
bot.sendText("Hello world.", data.raw);
```

### A Video or Image message

```javascript
bot.sendImage("http://url-of-media", data.raw, optionalMeta);

// OR

bot.sendVideo("http://url-of-media", data.raw, optionalMeta);
```

`optionalMeta` is an object of optional information for the media.
It should like:

```json
{
  "content": "description of the meta",
  "title": "title for the media"
}
```

## Middleware

Broid kit support middleware to allow you to preprocess receive or send message.

Example of Middleware support receive and send preprocessing

```javascript
class FakeMiddleware {
  constructor() {}

  service() {
    return "FakeMiddleware";
  }

  receive(bot, message) {
    return "hello world";
  }

  send(bot, message) {
    return "Good buy world";
  }
}
```

This middleware can be use now like that:

```javascript
bot.use(new FakeMiddleware());
```
