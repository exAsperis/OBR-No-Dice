export const canSubmitRoll=(expression:string,evaluationBusy:boolean,presentationBusy:boolean)=>Boolean(expression.trim())&&!evaluationBusy&&!presentationBusy;
export const isStoredResult=(requestId:string|undefined,storedRequestId:string|null)=>Boolean(requestId)&&requestId===storedRequestId;
export const canUseRevealActions=(requestId:string|undefined,storedRequestId:string|null,rerolling:boolean)=>isStoredResult(requestId,storedRequestId)&&!rerolling;
export const canStartAutoDismiss=(requestId:string|undefined,storedRequestId:string|null,rerolling:boolean,allLinesVisible:boolean,momentFrameDone:boolean)=>
  canUseRevealActions(requestId,storedRequestId,rerolling)&&allLinesVisible&&momentFrameDone;
