"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@broid/utils");
const Promise = require("bluebird");
const bodyParser = require("body-parser");
const express = require("express");
const R = require("ramda");
const Rx_1 = require("rxjs/Rx");
const isObservable = (obs) => obs && typeof obs.subscribe === 'function';
const isPromise = (obj) => obj && (typeof obj === 'object')
    && ('tap' in obj) && ('then' in obj) && (typeof obj.then === 'function');
class Bot {
    constructor(obj) {
        this.logLevel = obj && obj.logLevel || 'info';
        this.integrations = [];
        this.incomingMiddlewares = [];
        this.outgoingMiddlewares = [];
        this.router = express.Router();
        this.httpEndpoints = [];
        this.httpServer = null;
        if (obj && obj.http) {
            this.startHttpServer(obj.http);
        }
        this.logger = new utils_1.Logger('broidkit', this.logLevel);
    }
    getHTTPEndpoints() {
        return this.httpEndpoints;
    }
    getRouter() {
        if (this.httpServer) {
            return null;
        }
        return this.router;
    }
    use(instance, filter) {
        if (instance.listen) {
            this.logger.info({ method: 'use', message: `Integration: ${instance.serviceName()}` });
            this.addIntegration(instance);
        }
        else if (instance.incoming) {
            this.logger
                .info({ method: 'use', message: `incoming middleware: ${instance.serviceName()}` });
            this.incomingMiddlewares.push({
                filter: filter || null,
                middleware: instance,
                name: `${instance.serviceName()}.incoming`,
            });
        }
        else if (instance.outgoing) {
            this.logger
                .info({ method: 'use', message: `outgoing middleware: ${instance.serviceName()}` });
            this.outgoingMiddlewares.push({
                filter: filter || null,
                middleware: instance,
                name: `${instance.serviceName()}.outgoing`,
            });
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
        const listener = Rx_1.Observable
            .merge(...R.flatten(R.map((integration) => [integration.connect(), integration.listen()], this.integrations)))
            .mergeMap((message) => this.processIncomingMessage(message))
            .mergeMap((messageUpdated) => this.testIncoming(messageUpdated.message, patternRegex, messageTypesArr)
            ? Promise.resolve(messageUpdated) : Rx_1.Observable.empty());
        return this.processListener(listener, R.prop('callback', args));
    }
    hears(patterns, messageTypes, cb) {
        const args = this.processArgs(messageTypes, cb);
        const messageTypesArr = this.messageTypes2Arr(R.prop('msgTypes', args));
        const patternRegexes = R.map((pattern) => new RegExp(pattern, 'ig'), patterns);
        const listener = Rx_1.Observable
            .merge(...R.flatten(R.map((integration) => [integration.connect(), integration.listen()], this.integrations)))
            .mergeMap((message) => this.processIncomingMessage(message))
            .mergeMap((messageUpdated) => {
            const matches = R.pipe(R.map((patternRegex) => this.testIncoming(messageUpdated.message, patternRegex, messageTypesArr)), R.reject(R.equals(false)));
            if (!R.isEmpty(matches(patternRegexes))) {
                return Promise.resolve(messageUpdated);
            }
            return Rx_1.Observable.empty();
        });
        return this.processListener(listener, R.prop('callback', args));
    }
    on(messageTypes, cb) {
        return this.hear(true, messageTypes, cb);
    }
    sendText(text, message) {
        return this.processOutgoingContent(text, message)
            .then((updated) => {
            const content = updated.content || text;
            let data = {
                '@context': 'https://www.w3.org/ns/activitystreams',
                'generator': {
                    id: R.path(['generator', 'id'], message),
                    name: R.path(['generator', 'name'], message),
                    type: 'Service',
                },
                'object': {
                    content,
                    id: R.path(['object', 'id'], message),
                    type: 'Note',
                },
                'to': {
                    id: R.path(['target', 'id'], message),
                    type: R.path(['target', 'type'], message),
                },
                'type': 'Create',
            };
            data = this.addMessageContext(data, message);
            return this.send(data);
        });
    }
    sendVideo(url, message, meta) {
        return this.sendMedia(url, 'Video', message, meta);
    }
    sendImage(url, message, meta) {
        return this.sendMedia(url, 'Image', message, meta);
    }
    processOutgoingContent(content, message) {
        return this.processOutgoingMessage(content, message)
            .toPromise(Promise)
            .then((updated) => {
            const contents = R.reject(R.isNil)(R.map((o) => o.content, updated.data));
            if (!R.isEmpty(contents)) {
                updated.content = R.join(' ', contents);
            }
            return updated;
        });
    }
    messageTypes2Arr(messageTypes) {
        let messageTypesArr = [];
        if (messageTypes) {
            messageTypesArr = R.map((m) => R.toLower(m.replace(/^\s+|\s+$/g, '')), R.split(',', messageTypes));
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
        const messageContext = R.prop('@context', message);
        if (!messageContext) {
            this.logger.debug('Message incoming should follow Broid schema.', message);
            return false;
        }
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
        return this.processOutgoingContent(url, message)
            .then((urlUpdated) => {
            let data = {
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
            data = this.addMessageContext(data, message);
            return this.send(data);
        });
    }
    addIntegration(integration) {
        this.integrations.push(integration);
        if (!integration.getRouter) {
            return;
        }
        const router = integration.getRouter();
        if (router) {
            const httpPath = `/webhook/${integration.serviceName()}`;
            this.httpEndpoints.push(httpPath);
            this.router.use(httpPath, router);
        }
        return;
    }
    chain(input, filters) {
        const seq = Rx_1.Observable.from(filters);
        return seq.reduce((chain, filter, index) => {
            return chain.concatMap((data) => {
                return filter(data)
                    .map((filterResult) => {
                    return R.flatten(R.concat(data, [R.assoc('order', index, filterResult)]));
                });
            });
        }, Rx_1.Observable.of(input))
            .concatMap((value) => value);
    }
    processIncomingMessage(message) {
        const middlewares = R.map((middleware) => {
            return (acc) => {
                let resultObservable = Rx_1.Observable.empty();
                let patternRegexes = [];
                if (middleware.filter) {
                    const patterns = R.is(Array, middleware.filter) ? middleware.filter : [middleware.filter];
                    patternRegexes = R.map((pattern) => new RegExp(pattern, 'ig'), patterns);
                }
                const matches = R.pipe(R.map((patternRegex) => this.testIncoming(message, patternRegex, [])), R.reject(R.equals(false)));
                if (R.isEmpty(patternRegexes) || !R.isEmpty(matches(patternRegexes))) {
                    const fn = middleware.middleware.incoming;
                    const result = fn(this, message, acc);
                    if (isObservable(result)) {
                        resultObservable = result;
                    }
                    else if (isPromise(result)) {
                        resultObservable = Rx_1.Observable.fromPromise(result);
                    }
                    else {
                        resultObservable = Rx_1.Observable.of(result);
                    }
                }
                return resultObservable.map((data) => ({ middleware: middleware.name, data }));
            };
        }, this.incomingMiddlewares);
        const intialAcc = [];
        return this.chain(intialAcc, middlewares)
            .take(1)
            .map((data) => ({ data, message }));
    }
    processOutgoingMessage(content, message) {
        const middlewares = R.map((middleware) => {
            return (acc) => {
                let resultObservable = Rx_1.Observable.empty();
                let patternRegexes = [];
                if (middleware.filter) {
                    const patterns = R.is(Array, middleware.filter) ? middleware.filter : [middleware.filter];
                    patternRegexes = R.map((pattern) => new RegExp(pattern, 'ig'), patterns);
                }
                const matches = R.pipe(R.map((patternRegex) => this.testIncoming(message, patternRegex, [])), R.reject(R.equals(false)));
                if (R.isEmpty(patternRegexes) || !R.isEmpty(matches(patternRegexes))) {
                    const fn = middleware.middleware.outgoing;
                    const result = fn(this, content, message, acc);
                    if (isObservable(result)) {
                        resultObservable = result;
                    }
                    else if (isPromise(result)) {
                        resultObservable = Rx_1.Observable.fromPromise(result);
                    }
                    else {
                        resultObservable = Rx_1.Observable.of(result);
                    }
                }
                return resultObservable.map((d) => {
                    let data = d;
                    if (typeof data === 'string') {
                        data = {
                            content: data,
                        };
                    }
                    return { middleware: middleware.name, data, content: data.content };
                });
            };
        }, this.outgoingMiddlewares);
        const intialAcc = [];
        return this.chain(intialAcc, middlewares)
            .take(1)
            .map((data) => ({ data, message }));
    }
    startHttpServer(httpOptions) {
        if (!this.httpServer) {
            const app = express();
            app.use(bodyParser.json());
            app.use(bodyParser.urlencoded({ extended: false }));
            app.use(this.router);
            this.httpServer = app.listen(httpOptions.port, httpOptions.host, () => {
                this.logger.info(`Server listening on port ${httpOptions.host}:${httpOptions.port}...`);
            });
        }
    }
    addMessageContext(data, message) {
        const context = R.path(['object', 'context'], message);
        if (context) {
            data.object = R.assoc('context', context, data.object);
        }
        return data;
    }
}
exports.Bot = Bot;
