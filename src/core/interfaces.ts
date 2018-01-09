import { IActivityStream, IASContext } from '@broid/schemas';

import { Observable } from 'rxjs/Rx';

export type callbackType = (message: any, error?: any) => any;
export type middlewareIncomingType = (bot: any, message: any, acc?: any) => Promise<any> | Observable<any>;
export type middlewareOutgoingType = (bot: any,
                                      content: string,
                                      message: IActivityStream,
                                      acc?: any) => Promise<any> | Observable<any>;

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
  logLevel?: string;
  http?: IHTTPOptions;
}

export interface IMessage {
  data: any;
  message: IActivityStream;
}

export interface ISendData {
  generator: {
    id: string;
    name: string;
  };
  target: {
    id: string;
    type: string;
  };
  object?: {
    id: string;
    context: IASContext;
  };
}
