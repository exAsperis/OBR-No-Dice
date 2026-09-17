import { EXTENSION_ID } from './constants';
import type { RollExpressionInput } from './rollService';
import type { VerificationRecord } from './protocol';
export const VERIFY_LOCAL_CHANNEL=`${EXTENSION_ID}/verification-local/v1`;
export type VerificationLocalMessage =
  | {type:'status-request'|'status';roomId:string;playerId:string;available?:boolean}
  | {type:'roll';roomId:string;playerId:string;requestId:string;input:RollExpressionInput}
  | {type:'roll-response';roomId:string;playerId:string;requestId:string;verification?:VerificationRecord};
