import { Observable } from 'rxjs/Rx';
import { IActivityStream } from '@broid/schemas';

export type callbackType = (message: any, error?: any) => any;
export type middlewareIncomingType = (bot: any, message: any, acc?: any) => Promise<any> | Observable<any>;
export type middlewareOutgoingType = (bot: any, content: string, message: IActivityStream, acc?: any) => Promise<any> | Observable<any>;

export interface IHTTPOptions {
  host: string;
  port: number;
}

export interface IListenerArgs {
  callback?: callbackType ;
  msgTypes?: string | void;
}

export interface IMetaMediaSend {
  name?: string;
  content?: string;
}

export interface IOptions {
  logLevel: string;
  http?: IHTTPOptions;
}
