# No Dice

**No fake dice. No fake physics. Just randomness, probability, and the receipts.**

No Dice is an Owlbear Rodeo 2 extension for dice expressions, arbitrary weighted facets, staged roll traces, and live probability distributions. It uses React, TypeScript, Vite, and `@owlbear-rodeo/sdk` 3.1.

## Install and develop

Install the hosted extension in Owlbear Rodeo through **Extensions → Add Custom Extension** using `https://no-dice.ex-asperis.com/manifest.json`. The GitHub Pages workflow builds and deploys on pushes to `main`; the custom domain must point to that Pages site. For local development:

```sh
pnpm install
pnpm dev
```

Then add `http://localhost:5173/manifest-local.json` in Owlbear Rodeo. Run `pnpm run check:identity`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` before release. `manifest-v0.19.1.json` is a cache-busting alternative to the stable manifest. Releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html); the extension remains in the `0.x` development series.

## Interface

The action popover is a narrow rail beneath the No Dice extension button. Its shortcuts add dice to the current expression and open the separate main panel; **Open** displays the panel without editing the expression and changes to **Close** while it is open. Each button is a 24-pixel pill centered in a transparent 40-pixel row. The rail grows or shrinks with the button count, stopping about 100 pixels above the bottom of the screen; excess buttons scroll within it. Owlbear's action API exposes height but no position, so the extension measures the iframe's top when accessible and otherwise uses the scene viewport with a conservative top allowance. The main panel starts with an empty expression and contains the distribution, a one-line expression composer, the most recent visible result, and older history. Closing it clears the expression; a draft is retained only while the panel reopens after a position or size change. Distribution, Most Recent Result, and History can be collapsed independently; those choices are saved locally per Owlbear player. The expanded Distribution pane retains its chart and statistics space when the expression is empty or invalid. Collapsing sections shrinks the main panel's iframe to its visible content and shows a compact result preview in collapsed result sections, while longer result and history lists scroll within their sections. Surfaces use translucent colors derived from the current Owlbear theme. Version 0.18.1 increases only the main panel background opacity to match Owlbear controls more closely; shortcut buttons, expressions, roll results, and broadcast messages are unchanged. Version 0.19.0 keeps the Distribution chart height stable as result sections collapse, places its summary statistics in the section heading, moves the fairness control to a scales icon in the main header, and puts Notation next to Expression. These layout changes do not change expression, roll result, or broadcast behavior. Version 0.19.1 highlights active fairness sampling in red, adds a Reset control for observed chart data, and keeps Notation in a positioned popover within the panel frame. The expression language, roll results, and broadcast API remain compatible. GMs can open the title-bar gear to set the room-wide time between reveal lines (0 ms shows every line immediately) and add, remove, rename, or reorder shortcut buttons. Saving the settings updates every player's rail and future reveals without requiring a scene.

Drag either panel's title bar to choose its position. Owlbear permits a popover's position to be set when it opens, so a panel moves when the drag ends by reopening at the new position. The main panel's position is saved locally per player and centered if it would otherwise be off screen. The separate animated roll reveal remains available when the main panel is closed; its position is also saved locally per player and returns to the bottom right if it would be off screen. Version 0.15.0 adds dynamic rail sizing. Expression syntax, roll records, and No Dice API v1 remain compatible with 0.14.1.

## Native expressions

| Expression | Meaning |
| --- | --- |
| `d6`, `2d6`, `3d20` | Dice with integer facets 1 through N |
| `d{0,1}`, `d{-2,-1,0,1,2}` | Numeric arbitrary dice |
| `d{0..100}`, `d{-2..2}` | Inclusive integer facet ranges |
| `d{0.5,1,1.5}`, `d{1/2,1}` | Decimal or rational facets |
| `d{Miss,Miss,Hit,Crit}` | Symbolic facets; duplicates add weight |
| `d{d4,d6+1,2d8}` | Choose one facet, then evaluate its expression |
| `d{d6 cats,d4! dogs,3 naughty pigeons}` | Evaluated facets rendered as text |
| `d{A bag of d100 gold pieces}` | An expression embedded within a phrase |
| `2d6+4`, `(d4+2)*3` | Arithmetic and grouping |
| `p2d6`, `pool 2d6` | Preserve individual values |
| `s2d6`, `sum 2d6` | Explicitly sum numeric values |
| `pool(d4,d6)`, `sum(d4,d6)` | Legacy function forms for multiple sources |
| `H[2d20]`, `H3[4d6]` | Keep highest one or N |
| `L2[4d6]`, `DH[4d6]`, `DL2[4d6]` | Keep lowest or drop highest/lowest |
| `d6!`, `d6!2` | Explode the highest facet, unlimited or at most twice |
| `d{1,2,3,4,5!,6!}` | Two independently exploding facets |
| `d6r`, `2d6r1` | Reroll the lowest facet, without a limit or at most once |
| `d{1r,2r1,3,4,5,6}` | Reroll 1s without a limit and 2s at most once |
| `H[s2d6,d8]` | Compare a two-die sum with one d8 |
| `H(d4)[5d6]` | Roll d4 once to determine how many to keep |
| `(d4)d6`, `d(d{4,6,8})` | Dynamic quantity and die size |
| `2d6 | 6-:Fail; 7-9:Partial success; 10+:Success` | Interpret the numeric result using the first matching rule |

Unmarked dice retain `inferred` resolution in the AST. They resolve to a sum in ordinary numeric expressions and to individual results inside a selector's bracketed pool. Explicit `p`/`pool` or `s`/`sum` overrides that inference. Thus `H[2d6,d8]` selects from three individual rolls, while `H[s2d6,d8]` selects from two values. Commas inside `[...]` concatenate pool sources. Numeric selectors sum retained values; a single selected symbol remains symbolic. Symbolic facets cannot participate in arithmetic, and duplicate symbolic facets keep the rank of their first appearance. Parentheses only group expressions.

Each custom die facet is an equally likely branch. A branch may be a literal value, a dice expression, or text with one or more embedded expressions. No Dice chooses the branch first, then evaluates only that branch. `d{d4,d6+1,2d8}` therefore has an exact distribution equal to a one-third mixture of those three expression distributions. An inclusive range such as `d{0..100}` expands to 101 ordinary numeric facets; range bounds must be ascending integers and a custom die may have at most 1,000 facets. Text results such as `A bag of 42 gold pieces` remain categorical. A chosen branch with unlimited explosion uses the labeled estimate. Repeating a branch weights it just like repeating a literal facet. Text templates have no fixed symbolic rank, so highest/lowest selectors reject them rather than inventing an order.

Explosion is a property of a **numeric facet**. A marked facet adds another result from the same die; another marked facet continues the chain. `d6!` abbreviates `d{1,2,3,4,5,6!}`, and `d6!2` abbreviates `d{1,2,3,4,5,6!2}`. The `2` permits at most two additional rolls after the initial result, even if the second and third facets are marked. With differently limited facets, the initially selected facet sets the cap for that chain. Limited explosions have exact finite distributions when manageable; unlimited explosions are estimated. A die with no possible termination, such as `d1!`, is rejected. In symbolic or text facets, `!` is text: `d{Miss!,Hit}` returns `Miss!`. An embedded numeric expression can still explode before rendering text, as in `d{d4! dogs}`.

Facet rerolls replace the result instead of adding to it. `d6r` abbreviates `d{1r,2,3,4,5,6}`. A positive integer after `r` limits rerolls of that marked facet per die result: `d{1r,2r1,3,4,5,6}` keeps rerolling 1s, but rerolls a 2 at most once. If the replacement is another marked facet, its own limit applies. Each die in `2d6r` tracks its rerolls separately. Bounded rerolls have exact distributions when manageable; unlimited rerolls are estimated. `d1r` and other dice with no terminating facet are rejected. Native `d6r2` means at most two rerolls of 1; use `d6r=2` for the comparison based reroll of 2. This changes the native interpretation of bare `d6r2` from the previous Roll20 fallback meaning.

The notation panel shows the entered text, canonical short form, readable long form, and fully expanded long form. Short form collapses conventional facets to `dN` and omits selector count `1`; readable long form keeps conventional `dN` compact; expanded long form spells out all conventional facets. The two formatters serialize the AST independently. `H3[2d8]`, symbolic sums, nonpositive dice counts, and impossible dynamic structural values produce diagnostics rather than clamping or reinterpretation.

An optional `|` attaches a one-line interpretation table to a numeric expression. Each semicolon-separated rule is `condition:text`. Conditions may be an exact number (`7`), an inclusive range (`7-9`), a maximum (`6-` or `<=6`), or a minimum (`10+` or `>=10`); `<` and `>` are also supported. Rules are tested in written order, so the first match wins. A gap leaves the numeric result without an interpretation. Labels are literal text: `d6` or arithmetic inside a label is never rolled or evaluated. The ledger and reveal show both the numeric result and any matched label, while the probability chart remains the distribution of numeric results. Symbolic and explicit pool results cannot use a numeric interpretation table.

The input automatically accepts common Roll20 `NdM`, arithmetic, parentheses, `khN`, `klN`, `dhN`, `dlN`, `r` and `ro` with numeric comparisons, and `!`. For example, `2d20kh1+5`, `4d6dl1`, and `d6ro=1`. Native notation is preferred when both parsers accept an expression; Roll20 compatibility is an adapter into the same AST, not a second evaluator. Existing ledger entries retain their recorded dialect when reopened. Roll20 success counting and unusual modifier combinations are future work.

## Probability and rolls

Valid expressions are parsed 150 ms after typing stops, then evaluated in a Web Worker. Finite distributions are exact while the state space remains under the configured threshold in `src/engine/probability.ts`. Larger or unbounded expressions use an estimate of up to 20,000 trials, stopping after a 1.5-second calculation budget and labeling the actual trial count. The chart marks the latest selected roll outcome. Numeric results use a probability mass chart and show range, mean, population standard deviation, and mode; symbolic results show categories. The main chart displays at most 200 bars at once, enough for every outcome of `d{0..100}`. Since version 0.17.0, subtle guides mark 25%, 50%, 75%, and 100% of the chart's relative bar height, including when no bars are present. Version 0.18.0 adds the zero guide at the base. These visual changes do not alter expressions, roll results, or broadcast messages.

The shortcut rail has Coin (`d{0,1}`), d4, d6, d8, d10, d12, d20, d100, and `%` (`d{0..100}`). A shortcut inserts its term into an empty input or adds it to an existing expression. Clear empties the expression field and returns focus to it. If the final additive term is the same unmodified die, the shortcut increments its quantity instead (`d6` becomes `2d6`). Since version 0.16.0, shortcuts insert before the first `|` and preserve its interpretation table. A trailing `+`, `-`, `*`, or `/` is reused without adding `+`; a shortcut beginning with one of those operators supplies the operator and replaces a trailing one. This changes how custom shortcuts beginning with an operator compose with existing expressions.

**Calculate fairness** starts repeated local rolls of the current expression in a separate Web Worker. It begins at two rolls per second, doubles its pace about every 0.85 seconds, and caps at 2,048 rolls per second. Teal bars show the accumulating observed frequencies beside the expected distribution, with the sample count beneath the chart. **Stop** preserves the observed bars for inspection. Starting again resets the sample, and editing the expression clears it. These samples do not create ledger entries, broadcast messages, or saved history. If samples produce outcomes outside the 80 visible chart bars, their count is shown below the chart.

Rolls added to the ledger while an expression is active leave muted count markers at their outcomes on the distribution chart; the latest local result remains highlighted. Matching shared rolls count too. Changing the expression clears these chart markers and recalculates the distribution. The ledger itself remains available for rerolls and editing.

Roll randomness uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias. The engine accepts an injected RNG for deterministic tests. Unlimited explosions and rerolls have a defensive 100-step limit per die. Every roll also shares a 20,000-step work budget across nested facet expressions and draws, plus a nesting limit of 100. Hitting a limit produces a clear error instead of hanging. Statically certain infinite loops, including `d{1!}` and rerolling every possible face, are rejected before evaluation. The safety limits can reject an exceptionally long but theoretically terminating run; they never clamp or silently change its result.

## Roll reveal

Each permitted roll opens a separate result popover near the bottom right of every recipient's Owlbear window, even if their ledger action is closed. A compact distribution chart above the steps is calculated locally in a worker for that expression. It has one gapless bar per outcome, each at least one pixel wide, with rounded top corners where space allows; large distributions scroll horizontally. The current outcome turns gold only after the final result appears. The canonical short expression appears immediately. Each following line starts as a translucent copy of the previous one and moves down; unchanged text stays in place while the changing terms crossfade. Each line spans the popover and centers its text, so a longer replacement does not wrap while its term expands. The final **RESULT:** appears on a solid blue pill, with the result area kept scrolled to the bottom and balanced space below the pill. For example, `2d6+2` can become `[2, 3] + 2`, then `5 + 2`, then `RESULT: 7`. Steps arrive one second apart. Reduced-motion settings remove movement and fades but keep the one-second spacing. The evaluator records these reductions from the AST during the same roll. The ledger's **Show work** section uses the same steps; older saved rolls retain their earlier receipts. Intermediate lines may be shortened; the final result is never truncated. The popover remains until its dismiss button is pressed or another roll replaces it. The optional auto-dismiss toggle closes it a chosen number of seconds after the final line appears; its enabled state and seconds value are saved locally. While the timer runs, a solid background shrinks downward to reveal the translucent window; with auto-dismiss off, the background remains solid. **Reroll** rolls the shown expression again as the current player with the same visibility, creating a new receipt and broadcasting it to the same audience. The background page listens for everyone rolls, the sender's local self rolls, and encrypted GM rolls; it does not send private results to other players. The `background_url` manifest entry is required for this behavior.

## Multiplayer and privacy

Everyone rolls are broadcast as versioned events and appear in open No Dice ledgers and independent reveal popovers. Self rolls never leave the current client. GM rolls are encrypted with an ephemeral GM public key stored in room metadata; only the GM's background page holds the private key. The GM must have No Dice enabled in the room before a player can send a GM roll. The key changes when that background page reloads. OBR broadcasts are ephemeral, so a closed ledger can miss entries; local history stores the rolls that the ledger actually saw, capped at 100 per player and room. Scene metadata is not used for history, and rolling works even when no scene is open.

The extension is available to all players. Room metadata contains only the GM public key. The sender's own private roll is stored locally; other players see only encrypted GM payloads. As with any client extension, the result protocol does not provide a server trust guarantee against a malicious client forging messages.

## Calling No Dice from another Owlbear Rodeo extension

No Dice API v1 uses [LOCAL Owlbear broadcasts](https://docs.owlbear.rodeo/extensions/apis/broadcast/). No Dice must be installed and enabled for the same room and local user. Its background page listens even when its action popover is closed. Each request rolls once and receives a compact response on the matching `requestId`; the API does not expose its AST or evaluation trace.

```ts
export const NO_DICE_API_REQUEST = 'com.ex-asperis.no-dice/api/request';
export const NO_DICE_API_RESPONSE = 'com.ex-asperis.no-dice/api/response';

export interface NoDiceRollRequestV1 {
  protocolVersion: 1;
  type: 'roll';
  requestId: string;
  expression: string;
  options?: { record?: boolean; label?: string };
}
export type NoDicePublicValue =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'pool'; values: (number | string)[] };
export type NoDiceRollResponseV1 =
  | { protocolVersion: 1; type: 'rollResult'; requestId: string; ok: true;
      expression: { input: string; short: string; long: string };
      result: NoDicePublicValue; display: string }
  | { protocolVersion: 1; type: 'rollResult'; requestId: string; ok: false;
      error: { code: 'INVALID_REQUEST' | 'UNSUPPORTED_VERSION' | 'PARSE_ERROR'
        | 'VALIDATION_ERROR' | 'EVALUATION_ERROR'; message: string;
        start?: number; end?: number } };
```

Native notation is tried first, then Roll20 compatibility if native parsing fails. `expression.input` preserves the original input; `short` and `long` are the existing canonical short and readable long forms. `result` can be numeric, symbolic text, or an explicit pool. If a numeric roll matches a `|` interpretation rule, `result` is the interpretation text and `display` includes both number and text (for example, `7 · Partial success`). The internal roll record still retains the numeric value. Quoted interpretation labels such as `7-9:"Partial success"` return the text without quote marks.

`record` defaults to `true`: the roll uses No Dice's normal **Everyone** result channel, local history, and reveal display. It does not open the action popover or take focus. Set `record:false` to receive only the LOCAL API response, with no ledger or reveal entry. `label` is optional context shown with a recorded roll; it never changes evaluation or identifies the caller. Expression length is limited to 1,000 characters and labels to 200 characters. API responses and recorded broadcasts stay under a 12 KB payload budget; unusually long traces may be shortened, and oversized results receive an error. Unknown optional fields are ignored. Repeated request IDs reuse the first roll within the background page's recent request cache. A caller should generate a fresh UUID for every new roll.

Copy this caller pattern into another extension. Subscribe before sending; ignore unrelated responses; clean up on response, send failure, or timeout. A timeout means No Dice is unavailable or did not respond, so there is no need to query the installed extension list first.

```ts
import OBR from '@owlbear-rodeo/sdk';

const requestId = crypto.randomUUID();
const response = await new Promise<NoDiceRollResponseV1>((resolve, reject) => {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  const finish = (action: () => void) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    unsubscribe();
    action();
  };
  unsubscribe = OBR.broadcast.onMessage(NO_DICE_API_RESPONSE, event => {
    const data = event.data as NoDiceRollResponseV1;
    if (data?.protocolVersion !== 1 || data.type !== 'rollResult' || data.requestId !== requestId) return;
    finish(() => data.ok ? resolve(data) : reject(new Error(data.error.message)));
  });
  timer = setTimeout(() => finish(() => reject(new Error('No Dice did not respond'))), 3000);
  void OBR.broadcast.sendMessage(NO_DICE_API_REQUEST, {
    protocolVersion: 1, type: 'roll', requestId,
    expression: 'H[2d20]+5',
    options: { record: true, label: 'Longsword attack' },
  } satisfies NoDiceRollRequestV1, { destination: 'LOCAL' })
    .catch(error => finish(() => reject(error)));
});
```

A matching copyable helper is in `src/noDiceClient.ts`; the public message types and constants are in `src/noDiceApi.ts`. The earlier GM relay channels (`com.ex-asperis.no-dice/roll-request/v1` and `/roll-result/v1`) remain available for existing integrations but have different room-wide behavior. New local integrations should use the API v1 channels above.

## Architecture

`src/engine/tokenizer.ts` creates tokens with source spans. `parser.ts` turns tokens into the semantic AST in `ast.ts` and retains the original source in `parseDocument`; `interpretation.ts` parses and matches literal result tables as a separate AST node. A dice node stores its quantity, standard or custom die, and `inferred`/`pool`/`sum` mode. Custom facets are AST values, expressions, or text templates with embedded expression segments. `semantics.ts` resolves inferred modes by context in a separate pass without changing that AST, including nested facet expressions. `validate.ts` reports structured static diagnostics before rolling. `evaluate.ts` chooses a facet before evaluating its expression and builds trace steps; interpretation is applied only after the numeric value is known. `probability.ts` computes exact PMFs by mixing facet distributions independently of the random evaluator and falls back to sampling for large or unbounded cases. `format.ts` independently serializes short, readable long, and expanded long notation from the AST. `probability.worker.ts` keeps distribution work off the UI thread. `rollService.ts` is the shared application roll pipeline for the UI and public API. `noDiceApi.ts` defines the versioned external contract, `noDiceApiHandler.ts` validates and deduplicates requests, and `background.ts` owns its sole OBR listener. `protocol.ts`, `gmCrypto.ts`, and `persistence.ts` keep room transport and local history separate from dice semantics. `App.tsx` renders the chart, ledger, notation, and input.

Dynamic forms such as `H(d4)[5d6]` and `(d4)d(d{4,6,8})` are supported; each structural parameter is rolled once. Pool selectors share one AST abstraction for future operations. Future work includes exact algorithms for larger keep/drop distributions and richer Roll20 compatibility.
