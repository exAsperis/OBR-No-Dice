import { parse, parseAuto } from './engine/parser';
import { distribution } from './engine/probability';
import type { Dialect } from './engine/ast';
import { ExpressionError } from './engine/ast';
import { formatLongExpanded, formatLongReadable, formatShort } from './engine/format';
self.onmessage = (event: MessageEvent<{id:number; expression:string; dialect?:Dialect}>) => {
  const {id,expression,dialect}=event.data;
  try { const parsed=dialect?{ast:parse(expression,dialect),dialect}:parseAuto(expression);const {ast}=parsed; self.postMessage({id, dialect:parsed.dialect, result:distribution(ast), notation:{short:formatShort(ast),longReadable:formatLongReadable(ast),longExpanded:formatLongExpanded(ast)}}); }
  catch(error) { self.postMessage({id,error:error instanceof Error?error.message:'Probability unavailable',incomplete:error instanceof ExpressionError&&error.incomplete}); }
};
