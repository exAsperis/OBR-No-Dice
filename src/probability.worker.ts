import { parse } from './engine/parser';
import { distribution } from './engine/probability';
import type { Dialect } from './engine/ast';
import { ExpressionError } from './engine/ast';
self.onmessage = (event: MessageEvent<{id:number; expression:string; dialect:Dialect}>) => {
  const {id,expression,dialect}=event.data;
  try { self.postMessage({id, result:distribution(parse(expression,dialect))}); }
  catch(error) { self.postMessage({id,error:error instanceof Error?error.message:'Probability unavailable',incomplete:error instanceof ExpressionError&&error.incomplete}); }
};
