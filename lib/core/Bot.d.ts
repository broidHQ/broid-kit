/// <reference types="node" />
import { IActivityStream } from '@broid/schemas';
import * as express from 'express';
import * as http from 'http';
import { Observable } from 'rxjs/Rx';
import { callbackType, IMetaMediaSend, IOptions } from './interfaces';
export declare class Bot {
    httpEndpoints: string[];
    httpServer: http.Server | null;
    private router;
    integrations: any;
    private logLevel;
    private logger;
    private outgoingMiddlewares;
    private incomingMiddlewares;
    constructor(obj?: IOptions);
    getHTTPEndpoints(): string[];
    getRouter(): express.Router | null;
    use(instance: any, filter?: string | string[]): void;
    hear(pattern: string | boolean, messageTypes?: string | callbackType, cb?: callbackType): Observable<IActivityStream>;
    hears(patterns: string[], messageTypes?: string | callbackType, cb?: callbackType): Observable<IActivityStream>;
    on(messageTypes?: string | callbackType, cb?: callbackType): Observable<IActivityStream>;
    sendText(text: string, message: IActivityStream): any;
    sendVideo(url: string, message: IActivityStream, meta?: IMetaMediaSend): any;
    sendImage(url: string, message: IActivityStream, meta?: IMetaMediaSend): any;
    private processOutgoingContent(content, message);
    private messageTypes2Arr(messageTypes?);
    private processArgs(msgTypes?, cb?);
    private processListener(listener, callback?);
    private testIncoming(message, patternRegex, messageTypesArr);
    private send(data);
    private sendMedia(url, mediaType, message, meta?);
    private addIntegration(integration);
    private chain(input, filters);
    private processIncomingMessage(message);
    private processOutgoingMessage(content, message);
    private startHttpServer(httpOptions);
    private addMessageContext(data, message);
}
