# No Dice

**No fake dice. No fake physics. Just randomness, probability, and the receipts.**

No Dice is an Owlbear Rodeo 2 extension for dice expressions, arbitrary weighted facets, staged roll traces, and live probability distributions. It uses React, TypeScript, Vite, and `@owlbear-rodeo/sdk` 3.1.

## Install and develop

Install the hosted extension in Owlbear Rodeo through **Extensions → Add Custom Extension** using `https://no-dice.ex-asperis.com/manifest.json`. The GitHub Pages workflow builds and deploys on pushes to `main`; the custom domain must point to that Pages site. For local development:

```sh
pnpm install
pnpm dev
```

Then add `http://localhost:5173/manifest-local.json` in Owlbear Rodeo. Run `pnpm run check:identity`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` before release. `manifest-v0.49.0.json` is a cache-busting alternative to the stable manifest. Releases use [Semantic Versioning](https://semver.org/spec/v2.0.0.html); the extension remains in the `0.x` development series.

## Interface

Version 0.23.0 adds room sessions and a separate Statistics popover. The GM can rename or start a session; its name appears in the main panel for all players. Statistics are calculated from each user's own visible roll ledger, so totals may differ between players and the GM. The old 100-roll `localStorage` feed is imported once into a local IndexedDB **Previous Rolls** session; new records remain in IndexedDB and the normal feed still shows only the latest 100. The ledger targets 10,000 events and removes oldest prior-session rolls first when needed. A die count includes every physical draw, including rerolls and explosion draws. Results mode counts one final expression outcome per roll, while Dice mode counts individual draws. Existing roll broadcasts remain version 1 and the expression language is unchanged; new optional structured resolution data accompanies newly generated records. Legacy records retain their trace and receive best-effort individual die extraction.

Version 0.24.0 groups statistics expressions by their canonical dice and arithmetic expression, omitting interpretation rules and trailing `#` names. It upgrades existing IndexedDB ledger grouping keys in place; original expressions, labels, interpretations, results, and roll records remain intact. The new **Roll Sequence** tab accepts a case-insensitive regular expression over the canonical expression, a final-result comparison, and one or more players. It lists matching rolls in time order with one column per selected player and shows counts, match rates, and mean shown result for each. For Dungeon World `2d6` with an optional integer modifier, use `^2d6(?:[+-]\d+)?$` with `≤ 6`. The expression language, roll outcomes, and broadcast API remain compatible.

The action popover is a narrow rail beneath the No Dice extension button. Its shortcuts add dice to the current expression and open the separate main panel; **Open** displays the panel without editing the expression and changes to **Close** while it is open. Each button is a 24-pixel pill centered in a transparent 40-pixel row. The rail grows or shrinks with the button count, stopping about 100 pixels above the bottom of the screen; excess buttons scroll within it. Owlbear's action API exposes height but no position, so the extension measures the iframe's top when accessible and otherwise uses the scene viewport with a conservative top allowance. The main panel starts with an empty expression and contains the distribution, a wrapping expression composer, the most recent visible result, and older history. Closing it clears the expression; a draft is retained only while the panel reopens after a position or size change. Distribution, Most Recent Result, and History can be collapsed independently; those choices are saved locally per Owlbear player. The expanded Distribution pane retains its chart and statistics space when the expression is empty or invalid. Collapsing sections shrinks the main panel's iframe to its visible content and shows a compact result preview in collapsed result sections, while longer result and history lists scroll within their sections. Surfaces use translucent colors derived from the current Owlbear theme. Version 0.18.1 increases only the main panel background opacity to match Owlbear controls more closely; shortcut buttons, expressions, roll results, and broadcast messages are unchanged. Version 0.19.0 keeps the Distribution chart height stable as result sections collapse, places its summary statistics in the section heading, moves the fairness control to a scales icon in the main header, and puts Notation next to Expression. These layout changes do not change expression, roll result, or broadcast behavior. Version 0.19.1 highlights active fairness sampling in red, adds a Reset control for observed chart data, and keeps Notation in a positioned popover within the panel frame. The expression language, roll results, and broadcast API remain compatible. GMs can open the title-bar gear to set the room-wide time between reveal lines (0 ms shows every line immediately) and add, remove, rename, or reorder shortcut buttons. Saving the settings updates every player's rail and future reveals without requiring a scene.

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

Valid expressions are parsed 150 ms after typing stops, then evaluated in a Web Worker. Finite distributions are exact while the state space remains under the configured threshold in `src/engine/probability.ts`. Larger or unbounded expressions use an estimate of up to 20,000 trials, stopping after a 1.5-second calculation budget and labeling the actual trial count. The chart marks the latest selected roll outcome. Numeric results use a probability mass chart and show range, mean, population standard deviation, and mode; symbolic results show categories. The main chart displays at most 200 bars at once, enough for every outcome of `d{0..100}`. In version 0.28.1, bar tooltips show exact probability and, for numeric outcomes, inclusive at-or-below and at-or-above probabilities computed from the full distribution. Observed probability still appears when available. This compatible presentation fix does not change expressions, roll results, or broadcast messages. Since version 0.17.0, subtle guides mark 25%, 50%, 75%, and 100% of the chart's relative bar height, including when no bars are present. Version 0.18.0 adds the zero guide at the base. These visual changes do not alter expressions, roll results, or broadcast messages.

The shortcut rail has Coin (`d{0,1}`), d4, d6, d8, d10, d12, d20, d100, and `%` (`d{0..100}`). A shortcut inserts its term into an empty input or adds it to an existing expression. Clear empties the expression field and returns focus to it. If the final additive term is the same unmodified die, the shortcut increments its quantity instead (`d6` becomes `2d6`). Since version 0.16.0, shortcuts insert before the first `|` and preserve its interpretation table. Since version 0.22.0, a shortcut's own interpretation rules are appended after existing rules and its `#` name is joined to the existing name with ` + `. A trailing `+`, `-`, `*`, or `/` is reused without adding `+`; a shortcut beginning with one of those operators supplies the operator and replaces a trailing one. This changes how custom shortcuts beginning with an operator compose with existing expressions.

**Calculate fairness** starts repeated local rolls of the current expression in a separate Web Worker. It begins at two rolls per second, doubles its pace about every 0.85 seconds, and caps at 2,048 rolls per second. Teal bars show the accumulating observed frequencies beside the expected distribution, with the sample count beneath the chart. **Stop** preserves the observed bars for inspection. Starting again resets the sample, and editing the expression clears it. These samples do not create ledger entries, broadcast messages, or saved history. If samples produce outcomes outside the 80 visible chart bars, their count is shown below the chart.

Rolls added to the ledger while an expression is active leave muted count markers at their outcomes on the distribution chart; the latest local result remains highlighted. Matching shared rolls count too. Changing the expression clears these chart markers and recalculates the distribution. The ledger itself remains available for rerolls and editing.

Roll randomness uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias. The engine accepts an injected RNG for deterministic tests. Unlimited explosions and rerolls have a defensive 100-step limit per die. Every roll also shares a 20,000-step work budget across nested facet expressions and draws, plus a nesting limit of 100. Hitting a limit produces a clear error instead of hanging. Statically certain infinite loops, including `d{1!}` and rerolling every possible face, are rejected before evaluation. The safety limits can reject an exceptionally long but theoretically terminating run; they never clamp or silently change its result.

## Roll reveal

Each permitted roll opens a separate result popover near the bottom right of every recipient's Owlbear window, even if their ledger action is closed. A compact distribution chart above the steps is calculated locally in a worker for that expression. It has one gapless bar per outcome, each at least one pixel wide, with rounded top corners where space allows; large distributions scroll horizontally. The current outcome turns gold only after the final result appears. The canonical short expression appears immediately. Each following line starts as a translucent copy of the previous one and moves down; unchanged text stays in place while the changing terms crossfade. Each line spans the popover and centers its text, so a longer replacement does not wrap while its term expands. The final **RESULT:** appears on a solid blue pill, with the result area kept scrolled to the bottom and balanced space below the pill. For example, `2d6+2` can become `[2, 3] + 2`, then `5 + 2`, then `RESULT: 7`. Steps arrive 500 ms apart by default, using the room-wide calculation-speed setting. Reduced-motion settings remove movement and fades but keep that spacing. The evaluator records these reductions from the AST during the same roll. The ledger's **Show work** section uses the same steps; older saved rolls retain their earlier receipts. Intermediate lines may be shortened; the final result is never truncated. The popover remains until its dismiss button is pressed or another roll replaces it. The optional auto-dismiss toggle closes it a chosen number of seconds after the final line appears; its enabled state and seconds value are saved locally. While the timer runs, a solid background shrinks downward to reveal the translucent window; with auto-dismiss off, the background remains solid. **Reroll** rolls the shown expression again as the current player with the same visibility, creating a new receipt and broadcasting it to the same audience. The background page listens for everyone rolls, the sender's local self rolls, and encrypted GM rolls; it does not send private results to other players. The `background_url` manifest entry is required for this behavior.

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

Version 0.20.0 adds GM-controlled Verifiable Rolls, off by default. Gold on the Roll button and expression border means a compatible No Dice peer is reachable. A roll then uses two-client commit/reveal and records a compact verification receipt; interruption after both commitments creates a failure receipt rather than a reroll. Without a peer, rolls use the existing secure local RNG. The result field is additive and the dice grammar is unchanged. External extension API requests and reveal-popover rerolls remain local rolls for compatibility. See [the V1 protocol](docs/verifiable-roll-v1.md) for interoperability details.

Version 0.20.1 fixes peer discovery using the current player's Owlbear connection ID and adds live reachability status under the GM toggle. It is a compatible fix; protocol V1 and the external API are unchanged.

Version 0.20.2 applies the GM's Verifiable Rolls toggle immediately and makes verification state visible as a compact badge in the roll ledger and collapsed previews. It does not change protocol V1 or the external API.

Version 0.21.0 starts with History collapsed and other sections expanded for players without a saved layout preference. The main panel has Help and Close buttons, the calculation-speed default is 500 ms, and GM settings save on field blur (shortcut add/remove/reorder and the verification toggle apply immediately). Verifiable Rolls and Auto-dismiss use accessible switches, and the chart's ledger-count badges have solid backgrounds. In verified mode the expression's focus outline—not its resting border—turns gold. Nested dice operands and selected custom-facet rolls now appear as separate ledger reductions in left-to-right order. This changes seeded outcomes for custom dice with multiple nested facets, so verified rolls use [protocol V2](docs/verifiable-roll-v2.md) and do not pair with V1 clients. A trailing `# name` labels an expression without affecting its roll or interpretation rules; shortcut insertion preserves the suffix. The reveal window and ledger share a result-pill layout with a clickable verification checkmark and in-frame details. Existing saved room settings and per-player collapse preferences remain unchanged. The ordinary result wire format and external API remain compatible; the expression grammar gains the optional naming suffix.

Version 0.22.0 makes the expression editor wrap and grow with long expressions (up to a scrollable limit); Enter rolls and Shift+Enter inserts a line break. Adding a custom shortcut now combines both expressions' interpretation rules and `#` names: current rules precede shortcut rules and therefore win overlapping first matches, while both names appear as `# Current + Shortcut`. The one combined interpretation table evaluates the final numeric result. Ledger “Show work” uses a die/updated-expression column pair without divider lines or a duplicate final result; new roll records carry optional stage-aligned die labels, while older records remain readable without them. The dice grammar, verified-roll protocol V2, and external API remain compatible; the result wire format only gains the optional `stepDice` field.

The latest-result bar, its outcome label, and roll-count badge use notification blue for ordinary rolls and gold for verified rolls. The actual result pill stays notification blue in both cases.

The Help and Close header controls use consistent 24 × 24 pixel vector icons at every panel width.

Version 0.22.1 shows the collapsed Most Recent Result value in a compact notification-blue pill with white text; the verification mark remains outside the pill. This visual fix does not change roll results or the external API.

Version 0.22.2 positions that pill outside the header's text flow, allowing a larger value without increasing the header row height or moving it to the right. The expression editor now fills the space previously occupied by its separate Clear button; Clear appears inside the first line on hover or keyboard focus.

Version 0.26.0 adds extensible Query shortcuts: PbtA, PbtA 10+, Nat 20, Nat 1, Snake Eyes, and Boxcars. Query now has independent final Result and individual Roll filters, including an optional die type, so natural d20 faces are matched even when the final result has modifiers. Results and Dice still select the displayed outcome distribution. This is a compatible feature release; the roll ledger and broadcast API formats are unchanged.

Version 0.25.0 expands Session Statistics into Overview, Players, Expressions, Outcomes, Highlights, Timeline, Query, and Fairness tabs. Shared player and expression filters apply across views. Numeric roll percentiles use the exact theoretical distribution's discrete midpoint, P(X < result) + P(X = result)/2; unsupported or nonnumeric results are excluded. This is a compatible feature release. The roll ledger and broadcast API formats are unchanged. Fairness comparisons describe observed samples without a verdict.

Version 0.24.1 shows the roller's name in parentheses after the collapsed Most Recent Result pill, truncating long names in the available width. Clicking Roll or the result window's Reroll immediately places a “Rolling . . .” card in Most Recent Result and moves the prior result into History; the new card fills when its reveal animation finishes. Reroll uses the room's verification setting and the same seeded evaluator as a main-panel roll, including when the main panel is closed. The reveal window's highlighted distribution bar uses notification blue for ordinary rolls and gold for verified rolls, matching the main chart. Fairness chart tooltips include observed percentages while observation bars are present. Roll records and the external API remain unchanged.

The Statistics window has a maximize/restore control beside Close. Maximize fills the Owlbear viewport; Restore returns to its centered window size. The selected session, tab, and filters survive the resize.
Version 0.27.0 adds a GM-only stale-session reminder and a local Session Start picker. A new session can split only the current session; rolls at or after the chosen start move with their original timestamps and contents. The dialog previews the affected rolls before confirmation. When rolls move, the old session ends at its latest remaining roll (or its own start if empty); otherwise it retains the previous creation-time end behavior. Each player applies the shared session boundary to their own visible ledger, so private roll visibility and statistics remain local. This compatible feature release does not change the roll or broadcast protocol formats.

Version 0.28.0 renames the Statistics Query tab to Ledger and adds client-side CSV export for current filtered results or the entire selected session, plus lossless JSON export of that session. Exports include only rolls already visible in the local ledger; no roll data is uploaded. This is a compatible feature release and does not change the broadcast API.

Version 0.29.0 adds Roll Moments for rare individual die faces, numeric final results, and repeated player-expression-result streaks. Moments use exact probabilities only and are calculated from locally visible current-session rolls. This compatible feature adds visual borders, die markers, and streak lines; it does not change roll expressions or broadcast message versions.

Version 0.29.1 keeps the Most Recent Result card height steady while rolling, remembers whether its Show work section is expanded until the panel closes, and lets the panel grow to fit the recent result up to the viewport height. Expanded History keeps its own scroll limit. This compatible layout fix does not change expressions, roll results, or broadcast messages.

Version 0.30.0 adds GM-controlled room-wide Override Mode. Configure legal `dN` face values in GM Settings, then enable the mode to force matching die draws for all users and fairness observations. Theoretical probabilities and Roll Moments remain based on fair dice. Enabling Override stores the previous Verifiable Rolls setting and real session, turns verification off, and creates a disposable OVERRIDE session; disabling deletes that session and its rolls and restores both prior settings. Rolls made during the mode carry an optional `overridden` marker in the existing version 1 broadcast result, so existing consumers remain compatible. Expression syntax and public API request formats are unchanged.


Version 0.31.0 shows a badge for every recorded die draw in a dedicated column in Show Work and the timed result reveal. Selector reductions retain their source die term, and the reveal applies the same die, result, and streak rarity decorations as the ledger. This compatible presentation release does not change expression syntax or the broadcast protocol.

Version 0.31.1 aligns the die term, draw badges, and expression in shared columns across each Most Recent Result and History Show Work block. Badge groups wrap for larger dice pools. This compatible layout fix does not change roll results or the broadcast protocol.

Version 0.31.2 groups each die term with its draw badges in one wrapping cell in Show Work and the timed result window. Evaluated expressions remain in their own column. This compatible layout fix does not change roll results or the broadcast protocol.

Version 0.31.3 keeps unchanged trailing expression text visible during result-window reduction animations. For example, the + 2 remains visible when 2d6+2 becomes [6, 5] + 2. This compatible visual fix does not change roll results or the broadcast protocol.

Version 0.32.0 presents exploding dice one draw at a time in Show Work and the timed result window. Each triggering face expands into the next die term, each follow-up receives its own badge, and triggering badges carry a small bang marker and reduced-motion-aware pop effect. Roll results add only an optional deterministic xploded annotation to structured die draws, so existing version 1 consumers remain compatible.

Version 0.32.1 anchors result-window work at the top and reveals subsequent lines downward. The window continues to follow the newest line when the work exceeds the available height. This compatible visual fix does not change roll results or the broadcast protocol.

Version 0.32.2 removes duplicate work stages for explosion-capable dice when the rolled face does not trigger an explosion. A nontriggering d6! now presents one draw step followed by its resolved value. This compatible presentation fix does not change roll results or the broadcast protocol.

Version 0.33.0 holds result evaluation for one calculation frame when a draw triggers an explosion and paints an expanding white ring from that badge across the result-window background. The effect runs only in the result window and respects reduced-motion preferences. This compatible visual feature does not change roll results or the broadcast protocol.

Version 0.33.1 replaces the small explosion exclamation marker with a persistent burst behind each triggering die badge. The badge face masks the burst center so its edges remain visible in both Show Work and the result window. This compatible visual fix does not change roll results or the broadcast protocol.

Version 0.34.0 left-aligns the result label while keeping the result pill centered in the result window. Nonordinary result rarity receives an extra post-result frame with a yellow, orange, red, or white expanding ring centered on the pill; streak rarity sweeps a matching bar across it. Reveal completion and auto-dismiss wait for that frame, and reduced-motion mode skips it. This compatible visual feature does not change roll results or the broadcast protocol.

Version 0.34.1 moves the streak rarity sweep from the result pill to the full final-result area below its divider. The full-height sweep travels left to right behind the result content with a long tier-colored trailing fade. This compatible visual fix does not change roll results or the broadcast protocol.

Version 0.35.0 gives nonordinary individual die-rarity badges the same held-frame expanding ring used by rare final results. Rings originate at each qualifying badge and use yellow, orange, red, or white by tier; multiple qualifying badges on one work step animate together. Explosion-only badges retain a white ring. This compatible visual feature does not change roll results or the broadcast protocol.

Version 0.35.1 strictly isolates individual die badges and their rings to die-rarity moments. Result-rarity and streak-rarity moments cannot color, label, or animate a die badge; streak rarity remains confined to the final-result area sweep. This compatible visual fix does not change roll results or the broadcast protocol.

Version 0.35.2 centralizes rarity colors in src/rarity.ts and corrects their order to unusual red, exceptional orange, extraordinary yellow, and legendary white. Die badges, result borders, streak underlines, expanding rings, and streak sweeps all use this shared palette. This compatible visual fix does not change rarity thresholds, roll results, or the broadcast protocol.

Version 0.36.0 records each trigger's position in an explosion chain and colors its badge and expanding ring from the shared rarity palette: first red, second orange, third yellow, and fourth or later white. Explosion-chain color takes visual precedence over probability rarity on a triggering badge without changing the underlying rarity analysis. The optional explosion-number draw annotation keeps existing version 1 consumers compatible.

Version 0.37.0 expands room Override Mode to static numeric custom dice such as `d{0..100}` and `d{-1,0,1}`. Each override accepts an ordered, comma-separated face sequence such as `6,6,5,1`; matching draws consume the sequence in order and repeat it, including pool draws, rerolls, explosions, and fairness samples. Existing single-value override metadata remains readable and behaves as a one-value repeating sequence. This is a compatible extension of the existing roll protocol because roll records and probability calculations are unchanged.

Version 0.37.1 lets individual die Roll Moment rings animate during their evaluation line without holding the next evaluation frame. Explosion triggers retain their dedicated hold frame, and result-rarity and streak animations still receive a post-result frame before reveal completion and auto-dismiss begin.

Version 0.37.2 also removes the dedicated hold frame for explosion animations. Die rarity and explosion effects now run concurrently with normal evaluation-line timing, while result-rarity and streak effects retain their post-result frame before reveal completion and auto-dismiss.

Version 0.37.3 preserves the user's Most Recent Result collapsed state when a roll or reroll starts. While collapsed, the previous result preview is replaced by “Rolling . . .” until the new result is recorded. This compatible fix does not change expressions, roll results, or broadcast messages.

Version 0.38.0 groups exploding dice presentation the same way as rerolls: the initial dice pool appears on one reveal line, and simultaneous draws in each subsequent explosion round share a line and badge group. Result Roll Moments are no longer suppressed when supported unlimited explosions or rerolls prevent a finite exact distribution; simple summed pools use their exact inclusive result tail. This changes the staged roll-result structure but not random outcomes, expression syntax, final values, or the broadcast protocol.

Version 0.39.0 makes each roll lifecycle transactional through reveal animation, Roll Moment visuals, and successful local-ledger persistence. Roll, Reroll, manual dismiss, auto-dismiss, and API success now wait for an explicit stored acknowledgement. API and incoming external-API presentations drain in FIFO order without replacing an active reveal; duplicate request IDs remain deduplicated, and failed entries release the queue. This changes API response timing but not the request or response wire format.

Version 0.40.0 adds a browser-local registry of the latest observed Owlbear Rodeo player colors, updates it from player and party change events, and retains those colors for future historical-roll presentation. Roll records and the public roll/API wire formats are unchanged.

Version 0.41.0 removes the shared Statistics player and expression filters, keeps those selections local to their respective detail tabs, and streamlines Overview by removing its highest/lowest and hot/cold sections. Roll syntax, stored rolls, ledger schema, and public broadcast/API wire formats are unchanged.

Version 0.42.0 adds estimated reference distributions for normalized percentile statistics when an exact distribution is unavailable. Exact theoretical probabilities remain required for Fairness, expression expectations, and rarity-tail claims; stored data and public API formats are unchanged.

Version 0.43.0 streamlines the Statistics Ledger into a chronological, filterable record list with one roll per row, preserves its full filtering and export capabilities, and removes aggregate outcome and player-summary analysis from that tab. Stored rolls, sessions, expression syntax, and public broadcast/API formats are unchanged.

Version 0.44.0 redesigns Statistics Players as a horizontal comparison table and adds viewer-scoped, browser-persistent custom Count, Sum, or Average statistics using the Ledger filtering semantics. The versioned preference data is local UI configuration; stored sessions, rolls, expression syntax, and public broadcast/API formats are unchanged.

Version 0.45.0 replaces the Statistics Timeline histogram with clock-aligned 10-minute bands of chronological roll markers. Marker color follows the live local Owlbear player-color registry and marker size uses exact or estimated normalized percentiles without making rarity claims. Stored sessions, rolls, expression syntax, and public broadcast/API formats are unchanged.

Version 0.46.0 makes the Timeline band duration user-selectable in minutes, retaining 10 minutes as the default, and condenses consecutive runs of two or more empty bands into labeled gap rows. Stored sessions, rolls, expression syntax, and public broadcast/API formats are unchanged.

Version 0.47.0 redesigns Outcomes around tab-local Ledger-semantic filters, distinct final-result and selected-die analyses, observed distributions, descriptive summaries, and Results-only interpretation frequencies. Stored sessions, rolls, expression syntax, and public broadcast/API formats are unchanged.

Version 0.48.0 redesigns Expressions as a normalized-expression comparison view with dialect-aware grouping, observed numeric summaries, and exact-only theoretical distribution comparisons. Stored sessions, rolls, expression syntax, and public broadcast/API formats are unchanged.

Version 0.49.0 redesigns Highlights around shared exact rarity moments, normalized percentile extrema, genuine initial dice pools, streaks, explosion chains, and sliding session-pace bursts. Stored sessions, rolls, expression syntax, and public broadcast/API formats are unchanged.
