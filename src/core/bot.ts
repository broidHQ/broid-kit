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
  middlewareReceiveType,
  middlewareSendType,
} from './interfaces';

export class Bot {
  public httpEndpoints: string[];
  public httpServer: null | http.Server;

  private express: any;
  private httpOptions: IHTTPOptions;
  private integrations: any;
  private logLevel: string;
  private logger: Logger;
  private sendMiddlewares: any;
  private receiveMiddlewares: any;

  constructor(obj?: IOptions) {
    this.logLevel = obj && obj.logLevel || 'info';

    this.integrations = [];
    this.receiveMiddlewares = [];
    this.sendMiddlewares = [];

    const httpOptions: IHTTPOptions = { host: '0.0.0.0', port: 8080 };
    this.httpOptions = obj && obj.http || httpOptions;
    this.httpEndpoints = [];
    this.httpServer = null;

    this.logger = new Logger('broidkit', this.logLevel);
  }

  public getHTTPEndpoints(): string[] {
    return this.httpEndpoints;
  }

  public use(instance: any): void {
    // it's an integration
    if (instance.listen) {
      this.logger.info({ method: 'use', message: `Integration: ${instance.serviceName()}` });
      this.addIntegration(instance);
    } else if (instance.receive || instance.send) { // Middleware
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
      .mergeMap((message: IActivityStream) =>
        this.testIncoming(message, patternRegex, messageTypesArr)
        ? this.processIncomingMessage(message) : Observable.empty());

    return this.processListener(listener, R.prop('callback', args) as callbackType);
  }

  public hears(patterns: string[],
               messageTypes?: string | callbackType,
               cb?: callbackType): Observable<IActivityStream> | boolean  {
    const args: IListenerArgs = this.processArgs(messageTypes, cb);
    const messageTypesArr: string[] = this.messageTypes2Arr(R.prop('msgTypes', args) as string);
    const patternRegexes: RegExp[] = R.map((pattern: string) =>
      new RegExp(pattern, 'ig'), patterns);

    const listener: Observable<IActivityStream> = Observable.merge(...R.map((integration: any) =>
      integration.listen(), this.integrations))
        .mergeMap((message: IActivityStream) => {
          const matches = R.pipe(R.map((patternRegex: RegExp) =>
            this.testIncoming(message, patternRegex, messageTypesArr)),
            R.reject(R.equals(false)));

          if (!R.isEmpty(matches(patternRegexes))) {
            return this.processIncomingMessage(message);
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
    return this.processOutcomingMessage(text, message)
      .then((textUpdated) => {
        let data: ISendParameters = {
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

  private messageTypes2Arr(messageTypes?: string | null): string[] {
    let messageTypesArr: string[] = [];
    if (messageTypes) {
      messageTypesArr = R.map((m) => R.toLower(m), R.split(',', messageTypes));
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
      this.logger.debug('Message received should follow Broid schema.', message);
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

  private sendMedia(url: string, mediaType: string,
                    message: IActivityStream,
                    meta?: IMetaMediaSend): Promise<any> {
    return this.processOutcomingMessage(url, message)
      .then((urlUpdated) => {
        let data: ISendParameters = {
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

  private addIntegration(integration: any): void {
    this.integrations.push(integration);

    const router = integration.getRouter();
    if (router) {
      if (!this.express) {
        this.express = express();
      }

      const httpPath = `/webhook/${integration.serviceName()}`;
      this.httpEndpoints.push(httpPath);
      this.express.use(httpPath, router);
    }

    return;
  }

  private processIncomingMessage(message: IActivityStream): Promise<any> {
    return Promise.reduce(this.receiveMiddlewares, (data: any, fn: middlewareReceiveType) =>
                          fn(this, data), message)
                  .then((data) => ({ message: data, raw: message }));
  }

  private processOutcomingMessage(messageText: string, message: IActivityStream): Promise<any> {
    return Promise.reduce(this.sendMiddlewares, (text: any, fn: middlewareSendType) =>
                          fn(this, text, message), messageText);
  }

  private startHttpServer(): void {
    if (this.express && !this.httpServer) {
      this.httpServer = this.express.listen(this.httpOptions.port, this.httpOptions.host,
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
