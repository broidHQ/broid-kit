import { IActivityStream } from 'broid-schemas';

export type callbackType = (message: any, error?: any) => any;
export type middlewareReceiveType = (bot: any, message: any) => Promise<any>;
export type middlewareSendType = (bot: any, text: any, message: IActivityStream) => Promise<any>;

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
