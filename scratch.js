
const Rx = require("rxjs/Rx");
const Bot = require("./lib/core");

const fakeIntegration = {
  serviceId: () => "test_service",
  listen: () => {
    return Rx.Observable.interval(1500)
      .map(() => ({
        "@context": "https://www.w3.org/ns/activitystreams",
        "generator": {
          "id": "test_service",
          "name": "flowdock",
          "type": "Service"
        },
        "published": 1485039531281,
        "type": "Create",
        "actor": {
          "id": "266836",
          "name": "Marc Boui",
          "type": "Person"
        },
        "target": {
          "id": "bd9b6be2-f2b9-4918-ae6d-370aa68e3f5a",
          "name": "Main",
          "type": "Group"
        },
        "object": {
          "content": "hello world",
          "id": "85",
          "type": "Note",
          "context": {
            "content": "BZV2sTH0NTHG7CqndDheLShGaTS",
            "name": "thread",
            "type": "Object"
          }
        }
      }));
  },
  send: (data) => console.log(JSON.stringify(data, null, 2)),
  serviceName: () => {
    return "fakeIntegration";
  },
  getRouter: () => {
    return false;
  },
};

const fakeMiddleware = {
  receive: (bot, message) => {
    console.log("----------");
    console.log(JSON.stringify(message, null, 2));
    return "hello";
  }, // preprocess the message content
  send: (bot, text, message) => {
    return text + " Good";
  }, // preprocess the message content before it gets sent out
  serviceName: () => {
    return "fakeMiddleware";
  },
};

const fakeMiddleware2 = {
  receive: (bot, message) => {
    console.log("----------");
    console.log(JSON.stringify(message, null, 2));

    return message + " world";
  }, // preprocess the message content
  send: (bot, text, message) => {
    return text + " bye";
  }, // preprocess the message content before it gets sent out
  serviceName: () => {
    return "fakeMiddleware2";
  },
};

console.log('Starting...');


const bot = new Bot();
// bot.use(new Broid-Slack(<...options>));
bot.use(fakeIntegration);
bot.use(fakeMiddleware);
bot.use(fakeMiddleware2);

// wildcard matching
// bot.hear(true, 'Group')
  // .subscribe(data => {
    // console.log("hear data", data);
  // });

bot.hear('hello.*', 'Group')
  .subscribe((message) => {
    console.log("hear data", message);
    bot.sendText("Issam ", message.raw);
  });

// bot.hears(['keyword', 'hello.*'])
//   .subscribe(data => {
//     console.log("hears data", data);
//   });



// const r = bot.hear('hello.*', 'Group', (message, error) => {
  // console.log("hear with cb", message);
// })
// console.log("r:", r);

// const r = bot.hears(['keyword', 'hello.*'], 'Group', (message, error) => {
  // console.log("hears with cb", message);
// })
// console.log("r:", r);
