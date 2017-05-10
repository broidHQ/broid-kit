import {
  IActivityStream,
  ISendParameters,
} from '@broid/schemas';
import { Logger } from '@broid/utils';

import * as Promise from 'bluebird';
import * as express from 'express';
import * as http from 'http';
import * as R from 'ramda';
import { Observable } from 'rxjs/Rx';

import {
  callbackType,
  IHTTPOptions,
  IListenerArgs,
  IMetaMediaSend,
  IOptions,
  middlewareIncomingType,
  middlewareOutgoingType,
} from './interfaces';

const isObservable = (obs: any): boolean => obs && typeof obs.subscribe === 'function';
const isPromise = (obj: any): boolean =>
  obj && (typeof obj === 'object')
      && ('tap' in obj) && ('then' in obj) && (typeof obj.then === 'function');

export class Bot {
  public httpEndpoints: string[];
  public httpServer: null | http.Server;
  public express: any;

  private httpOptions: IHTTPOptions;
  private integrations: any;
  private logLevel: string;
  private logger: Logger;
  private outgoingMiddlewares: any;
  private incomingMiddlewares: any;

  constructor(obj?: IOptions) {
    this.logLevel = obj && obj.logLevel || 'info';

    this.integrations = [];
    this.incomingMiddlewares = [];
    this.outgoingMiddlewares = [];

    const httpOptions: IHTTPOptions = { host: '0.0.0.0', port: 8080 };
    this.httpOptions = obj && obj.http || httpOptions;
    this.httpEndpoints = [];
    this.httpServer = null;

    this.logger = new Logger('broidkit', this.logLevel);
  }

  public getHTTPEndpoints(): string[] {
    return this.httpEndpoints;
  }

  public getExpress(): any {
    if (!this.express) {
      this.express = express();
    }
    return this.express;
  }

  public use(instance: any, filter?: string | string[]): void {
    // it's an integration
    if (instance.listen) {
      this.logger.info({ method: 'use', message: `Integration: ${instance.serviceName()}` });
      this.addIntegration(instance);
    } else if (instance.incoming) {
      this.logger
        .info({ method: 'use', message: `incoming middleware: ${instance.serviceName()}` });
      this.incomingMiddlewares.push({
        filter: filter || null,
        middleware: instance,
        name: `${instance.serviceName()}.incoming`,
      });
    } else if (instance.outgoing) { // Middleware
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

  // messageTypes => Image, Video, Group, Private, Mention etc...
  public hear(pattern: string | boolean,
              messageTypes?: string | callbackType,
              cb?: callbackType): Observable<IActivityStream> | boolean  {
    const args: IListenerArgs = this.processArgs(messageTypes, cb);
    const messageTypesArr: string[] = this.messageTypes2Arr(R.prop('msgTypes', args) as string);

    let patternRegex: boolean | RegExp = false;
    if (typeof(pattern) === 'string') {
      patternRegex = new RegExp(pattern as string, 'ig');
    } else {
      patternRegex = pattern as boolean;
    }

    const listener: Observable<IActivityStream> = Observable
      .merge(...R.flatten(R.map((integration: any) =>
        [integration.connect(), integration.listen()], this.integrations)))
      .mergeMap((message: IActivityStream) => this.processIncomingMessage(message))
      .mergeMap((messageUpdated: any) =>
        this.testIncoming(messageUpdated.message, patternRegex, messageTypesArr)
        ? Promise.resolve(messageUpdated) : Observable.empty());

    return this.processListener(listener, R.prop('callback', args) as callbackType);
  }

  public hears(patterns: string[],
               messageTypes?: string | callbackType,
               cb?: callbackType): Observable<IActivityStream> | boolean  {
    const args: IListenerArgs = this.processArgs(messageTypes, cb);
    const messageTypesArr: string[] = this.messageTypes2Arr(R.prop('msgTypes', args) as string);
    const patternRegexes: RegExp[] = R.map((pattern: string) =>
      new RegExp(pattern, 'ig'), patterns);

    const listener: Observable<IActivityStream> = Observable
        .merge(...R.flatten(R.map((integration: any) =>
          [integration.connect(), integration.listen()], this.integrations)))
        .mergeMap((message: IActivityStream) => this.processIncomingMessage(message))
        .mergeMap((messageUpdated: any) => {
          const matches = R.pipe(R.map((patternRegex: RegExp) =>
            this.testIncoming(messageUpdated.message, patternRegex, messageTypesArr)),
            R.reject(R.equals(false)));

          if (!R.isEmpty(matches(patternRegexes))) {
            return Promise.resolve(messageUpdated);
          }

          return Observable.empty();
        });

    return this.processListener(listener, R.prop('callback', args) as callbackType);
  }

  public on(messageTypes?: string | callbackType,
            cb?: callbackType): Observable<IActivityStream> | boolean  {
    return this.hear(true, messageTypes, cb);
  }

  public sendText(text: string, message: IActivityStream) {
    return this.processOutgoingContent(text, message)
      .then((updated) => {
        const content: string = updated.content || text;
        let data: ISendParameters = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          'generator': {
            id: R.path(['generator', 'id'], message),
            name: R.path(['generator', 'name'], message),
            type: 'Service',
          },
          'object': {
            content,
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

  public sendVideo(url: string, message: IActivityStream, meta?: IMetaMediaSend) {
    return this.sendMedia(url, 'Video', message, meta);
  }

  public sendImage(url: string, message: IActivityStream, meta?: IMetaMediaSend) {
    return this.sendMedia(url, 'Image', message, meta);
  }

  private processOutgoingContent(content: string, message: IActivityStream): Promise<any> {
    return this.processOutgoingMessage(content, message)
      .toPromise(Promise)
      .then((updated) => {
        const contents = R.reject(R.isNil)(R.map((o: any) => o.content, updated.data));
        if (!R.isEmpty(contents)) {
          updated.content = R.join(' ', contents);
        }
        return updated;
      });
  }

  private messageTypes2Arr(messageTypes?: string | null): string[] {
    let messageTypesArr: string[] = [];
    if (messageTypes) {
      messageTypesArr = R.map((m) =>
        R.toLower(m.replace(/^\s+|\s+$/g, '')), R.split(',', messageTypes));
    }
    return messageTypesArr;
  }

  private processArgs(msgTypes?: string | callbackType, cb?: callbackType): IListenerArgs {
    if (R.is(Function, msgTypes)) {
      return {
        callback: msgTypes as callbackType,
      };
    }

    return {
      callback: cb,
      msgTypes: msgTypes as string,
    };
  }

  private processListener(listener: Observable<IActivityStream>,
                          callback?: callbackType): Observable<IActivityStream> | boolean {

    // Start the http server
    this.startHttpServer();

    if (callback) {
      listener.subscribe(callback, (error) => callback(null, error));
      return true;
    }
    return listener;
  }

  private testIncoming(message: IActivityStream,
                       patternRegex: RegExp | boolean,
                       messageTypesArr: string[]): boolean {
    const messageContext = R.prop('@context', message);
    if (!messageContext) {
      this.logger.debug('Message incoming should follow Broid schema.', message);
      return false;
    }

    const content = R.path(['object', 'content'], message);
    const targetType = R.toLower(R.path(['target', 'type'], message) as string);

    if (R.isEmpty(messageTypesArr) || R.contains(targetType, messageTypesArr)) {
      if (patternRegex instanceof RegExp) {
        const isMatch = patternRegex.test(content as string);

        // FIX: http://stackoverflow.com/questions/18462784/why-is-javascript-regex-matching-every-second-time
        patternRegex.lastIndex = 0;

        if (isMatch === true) {
          return true;
        }
      } else if (patternRegex === true) {
        return true;
      }
    }

    return false;
  }

  private send(data: ISendParameters): Promise<any> {
    const to = R.path(['to', 'id'], data);
    const toType = R.path(['to', 'type'], data);
    const serviceID = R.path(['generator', 'id'], data);
    const serviceName = R.path(['generator', 'name'], data);

    if (to && toType && serviceID && serviceName) {
      const integrationFind = R.filter((integration: any) =>
        integration.serviceId() === serviceID, this.integrations);

      if (!R.isEmpty(integrationFind)) {
        return integrationFind[0].send(data);
      }

      return Promise.reject(`Integration ${serviceID} not found.`);
    }

    return Promise.reject('Message should follow broid-schemas.');
  }

  private sendMedia(url_: string, mediaType: string,
                    message: IActivityStream,
                    meta?: IMetaMediaSend): Promise<any> {
    return this.processOutgoingContent(url_, message)
      .then((urlUpdated) => {
        const url: string = urlUpdated.url || url_;

        let data: ISendParameters = {
          '@context': 'https://www.w3.org/ns/activitystreams',
          'generator': {
            id: R.path(['generator', 'id'], message),
            name: R.path(['generator', 'name'], message),
            type: 'Service',
          },
          'object': {
            content: R.prop('content', meta),
            name: R.prop('name', meta),
            type: mediaType,
            url: url,
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

  private addIntegration(integration: any): void {
    this.integrations.push(integration);

    const router = integration.getRouter();
    if (router) {
      const httpPath = `/webhook/${integration.serviceName()}`;
      this.httpEndpoints.push(httpPath);
      this.getExpress().use(httpPath, router);
    }

    return;
  }

  /**
   * I'd like to identify I way reach the same results dynamically, given an array (or sequence) of filters.
   *
   * @param input {} A value to be processed by a chain of filters.
   * @param filters {Array} An array of filters through which to process the input.
   * @returns {Observable} The output after processing `input` through the chained filters.
   */
  private chain(input, filters) {
    const seq = Observable.from(filters);

    return seq.reduce(
      (chain: any, filter: any, index: any) => {
        return chain.concatMap((data: any) => {
          return filter(data)
            .map((filterResult: any) => {
              return R.flatten(R.concat(data, [R.assoc('order', index, filterResult)]));
            });
        });
      },
      Observable.of(input),
    )
    .concatMap((value: any) => value);
  }

  private processIncomingMessage(message: IActivityStream): Observable<any> {
    const middlewares = R.map((middleware: any) => {
      return (acc: any) => {
        let resultObservable = Observable.empty();

        // Filter by regex if it' set
        let patternRegexes: boolean[] | RegExp[] = [];
        if (middleware.filter) {
          const patterns = R.is(Array, middleware.filter) ? middleware.filter : [middleware.filter];
          patternRegexes = R.map((pattern: string) => new RegExp(pattern, 'ig'), patterns);
        }

        const matches = R.pipe(R.map((patternRegex: RegExp | boolean) =>
          this.testIncoming(message, patternRegex, [])),
          R.reject(R.equals(false)));

        if (R.isEmpty(patternRegexes) || !R.isEmpty(matches(patternRegexes))) {
          const fn: middlewareIncomingType = middleware.middleware.incoming;
          const result: any = fn(this, message, acc);

          if (isObservable(result)) {
            resultObservable = result;
          } else if (isPromise(result)) {
            resultObservable = Observable.fromPromise(result);
          } else {
            resultObservable = Observable.of(result);
          }
        }

        return resultObservable.map((data) => ({ middleware: middleware.name, data }));
      };
    }, this.incomingMiddlewares);

    const intialAcc = [];
    return this.chain(intialAcc, middlewares)
      .take(1)
      .map((data: any) => ({ data, message }));
  }

  private processOutgoingMessage(content: string, message: IActivityStream): Observable<any> {
    const middlewares = R.map((middleware: any) => {
      return (acc: any) => {
        let resultObservable = Observable.empty();

        // Filter by regex if it' set
        let patternRegexes: boolean[] | RegExp[] = [];
        if (middleware.filter) {
          const patterns = R.is(Array, middleware.filter) ? middleware.filter : [middleware.filter];
          patternRegexes = R.map((pattern: string) => new RegExp(pattern, 'ig'), patterns);
        }

        const matches = R.pipe(R.map((patternRegex: RegExp | boolean) =>
          this.testIncoming(message, patternRegex, [])),
          R.reject(R.equals(false)));

        if (R.isEmpty(patternRegexes) || !R.isEmpty(matches(patternRegexes))) {
          const fn: middlewareOutgoingType = middleware.middleware.outgoing;
          const result: any = fn(this, content, message, acc);

          if (isObservable(result)) {
            resultObservable = result;
          } else if (isPromise(result)) {
            resultObservable = Observable.fromPromise(result);
          } else {
            resultObservable = Observable.of(result);
          }
        }

        return resultObservable.map((d: any) => {
          let data: any = d;
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
      .map((data: any) => ({ data, message }));
  }

  private startHttpServer(): void {
    if (!this.httpServer) {
      this.httpServer = this.getExpress().listen(this.httpOptions.port, this.httpOptions.host,
        () => {
          this.logger
            .info(`Server listening on port ${this.httpOptions.host}:${this.httpOptions.port}...`);
        });
    }
  }

  private addMessageContext(data: ISendParameters, message: IActivityStream): ISendParameters {
    const context = R.path(['object', 'context'], message);

    if (context) {
      data.object = R.assoc('context', context, data.object);
    }

    return data;
  }
}
