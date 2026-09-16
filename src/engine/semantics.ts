import type { Node } from './ast';
export type EvaluationContext='scalar'|'pool-source';
export type EffectiveResolution='pool'|'sum';
export interface SemanticPlan { modeFor(node:Extract<Node,{kind:'dice'}>):EffectiveResolution }
/** Resolve inferred dice only after parsing, using each node's semantic context. */
export function resolveSemantics(root:Node):SemanticPlan{
  const modes=new WeakMap<Node,EffectiveResolution>();
  const walk=(node:Node,context:EvaluationContext):void=>{
    switch(node.kind){
      case 'literal':break;
      case 'group':walk(node.value,context);break;
      case 'unary':walk(node.value,'scalar');break;
      case 'binary':walk(node.left,'scalar');walk(node.right,'scalar');break;
      case 'dice':
        modes.set(node,node.resolution==='inferred'?(context==='pool-source'?'pool':'sum'):node.resolution);
        walk(node.quantity,'scalar');
        if(node.die.kind==='standard-die')walk(node.die.sides,'scalar');
        else for(const facet of node.die.facets){
          if(facet.kind==='expression')walk(facet.expression,'scalar');
          if(facet.kind==='template')for(const segment of facet.segments)if(segment.kind==='expression')walk(segment.expression,'scalar');
        }
        break;
      case 'pool':node.items.forEach(item=>walk(item,'pool-source'));break;
      case 'resolve':walk(node.value,'pool-source');break;
      case 'selector':walk(node.count,'scalar');walk(node.source,'pool-source');break;
    }
  };
  walk(root,'scalar');
  return {modeFor(node){const mode=modes.get(node);if(!mode)throw new Error('Dice node missing semantic resolution');return mode;}};
}
