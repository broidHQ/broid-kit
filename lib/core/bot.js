"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const broid_utils_1 = require("broid-utils");
const Promise = require("bluebird");
const express_1 = require("express");
const R = require("ramda");
const Rx_1 = require("rxjs/Rx");
class Bot {
    constructor(obj) {
        this.logLevel = obj && obj.logLevel || 'info';
        this.integrations = [];
        this.receiveMiddlewares = [];
        this.sendMiddlewares = [];
        this.httpEndpoints = [];
        this.logger = new broid_utils_1.Logger('broidkit', this.logLevel);
    }
    getHTTPEndpoints() {
        return this.httpEndpoints;
    }
    use(instance) {
        if (instance.listen) {
            this.logger.info({ method: 'use', message: `Integration: ${instance.serviceName()}` });
            this.addIntegration(instance);
        }
        else if (instance.receive || instance.send) {
            if (instance.receive) {
                this.logger
                    .info({ method: 'use', message: `Receive middleware: ${instance.serviceName()}` });
                this.receiveMiddlewares.push(instance.receive);
            }
            if (instance.send) {
                this.logger
                    .info({ method: 'use', message: `Send middleware: ${instance.serviceName()}` });
                this.sendMiddlewares.push(instance.send);
            }
        }
        return;
    }
    hear(pattern, messageTypes, cb) {
        const args = this.processArgs(messageTypes, cb);
        const messageTypesArr = this.messageTypes2Arr(R.prop('msgTypes', args));
        let patternRegex = false;
        if (typeof (pattern) === 'string') {
            patternRegex = new RegExp(pattern, 'ig');
        }
        else {
            patternRegex = pattern;
        }
        const listener = Rx_1.Observable.merge(...R.map((integration) => integration.listen(), this.integrations))
            .mergeMap((message) => this.testIncoming(message, patternRegex, messageTypesArr)
            ? this.processIncomingMessage(message) : Rx_1.Observable.empty());
        return this.processListener(listener, R.prop('callback', args));
    }
    hears(patterns, messageTypes, cb) {
        const args = this.processArgs(messageTypes, cb);
        const messageTypesArr = this.messageTypes2Arr(R.prop('msgTypes', args));
        const patternRegexes = R.map((pattern) => new RegExp(pattern, 'ig'), patterns);
        const listener = Rx_1.Observable.merge(...R.map((integration) => integration.listen(), this.integrations))
            .mergeMap((message) => {
            const matches = R.pipe(R.map((patternRegex) => this.testIncoming(message, patternRegex, messageTypesArr)), R.reject(R.equals(false)));
            if (!R.isEmpty(matches(patternRegexes))) {
                return this.processIncomingMessage(message);
            }
            return Rx_1.Observable.empty();
        });
        return this.processListener(listener, R.prop('callback', args));
    }
    on(messageTypes, cb) {
        return this.hear(true, messageTypes, cb);
    }
    sendText(text, message) {
        return this.processOutcomingMessage(text, message)
            .then((textUpdated) => {
            const data = {
                '@context': 'https://www.w3.org/ns/activitystreams',
                'generator': {
                    id: R.path(['generator', 'id'], message),
                    name: R.path(['generator', 'name'], message),
                    type: 'Service',
                },
                'object': {
                    content: textUpdated,
                    type: 'Note',
                },
                'to': {
                    id: R.path(['target', 'id'], message),
                    type: R.path(['target', 'type'], message),
                },
                'type': 'Create',
            };
            return this.send(data);
        });
    }
    sendVideo(url, message, meta) {
        return this.sendMedia(url, 'Video', message, meta);
    }
    sendImage(url, message, meta) {
        return this.sendMedia(url, 'Image', message, meta);
    }
    messageTypes2Arr(messageTypes) {
        let messageTypesArr = [];
        if (messageTypes) {
            messageTypesArr = R.map((m) => R.toLower(m), R.split(',', messageTypes));
        }
        return messageTypesArr;
    }
    processArgs(msgTypes, cb) {
        if (R.is(Function, msgTypes)) {
            return {
                callback: msgTypes,
            };
        }
        return {
            callback: cb,
            msgTypes: msgTypes,
        };
    }
    processListener(listener, callback) {
        if (callback) {
            listener.subscribe(callback, (error) => callback(null, error));
            return true;
        }
        return listener;
    }
    testIncoming(message, patternRegex, messageTypesArr) {
        const content = R.path(['object', 'content'], message);
        const targetType = R.toLower(R.path(['target', 'type'], message));
        if (R.isEmpty(messageTypesArr) || R.contains(targetType, messageTypesArr)) {
            if (patternRegex instanceof RegExp) {
                const isMatch = patternRegex.test(content);
                patternRegex.lastIndex = 0;
                if (isMatch === true) {
                    return true;
                }
            }
            else if (patternRegex === true) {
                return true;
            }
        }
        return false;
    }
    send(data) {
        const to = R.path(['to', 'id'], data);
        const toType = R.path(['to', 'type'], data);
        const serviceID = R.path(['generator', 'id'], data);
        const serviceName = R.path(['generator', 'name'], data);
        if (to && toType && serviceID && serviceName) {
            const integrationFind = R.filter((integration) => integration.serviceId() === serviceID, this.integrations);
            if (!R.isEmpty(integrationFind)) {
                return integrationFind[0].send(data);
            }
            return Promise.reject(`Integration ${serviceID} not found.`);
        }
        return Promise.reject('Message should follow broid-schemas.');
    }
    sendMedia(url, mediaType, message, meta) {
        return this.processOutcomingMessage(url, message)
            .then((urlUpdated) => {
            const data = {
                '@context': 'https://www.w3.org/ns/activitystreams',
                'generator': {
                    id: R.path(['generator', 'id'], message),
                    name: R.path(['generator', 'name'], message),
                    type: 'Service',
                },
                'object': {
                    content: R.prop('content', meta),
                    title: R.prop('title', meta),
                    type: mediaType,
                    url: urlUpdated,
                },
                'to': {
                    id: R.path(['target', 'id'], message),
                    type: R.path(['target', 'type'], message),
                },
                'type': 'Create',
            };
            return this.send(data);
        });
    }
    addIntegration(integration) {
        this.integrations.push(integration);
        const router = integration.getRouter();
        if (router) {
            if (!this.httpServer) {
                this.httpServer = express_1.default();
            }
            const httpPath = `/webhook/${integration.serviceName()}`;
            this.httpEndpoints.push(httpPath);
            this.httpServer.use(httpPath, router);
        }
        return;
    }
    processIncomingMessage(message) {
        return Promise.reduce(this.receiveMiddlewares, (data, fn) => fn(this, data), message)
            .then((data) => ({ message: data, raw: message }));
    }
    processOutcomingMessage(messageText, message) {
        return Promise.reduce(this.sendMiddlewares, (text, fn) => fn(this, text, message), messageText);
    }
}
exports.Bot = Bot;
