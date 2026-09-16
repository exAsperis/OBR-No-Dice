# No Dice

**No fake dice. No fake physics. Just randomness, probability, and the receipts.**

No Dice is an Owlbear Rodeo 2 action popover for dice expressions, arbitrary weighted facets, staged roll traces, and live probability distributions. It uses React, TypeScript, Vite, and `@owlbear-rodeo/sdk` 3.1.

## Install and develop

Install the hosted extension in Owlbear Rodeo through **Extensions → Add Custom Extension** using `https://no-dice.ex-asperis.com/manifest.json`. The GitHub Pages workflow builds and deploys on pushes to `main`; the custom domain must point to that Pages site. For local development:

```sh
pnpm install
pnpm dev
```

Then add `http://localhost:5173/manifest-local.json` in Owlbear Rodeo. Run `pnpm run check:identity`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build` before release. `manifest-v0.1.4.json` is a cache-busting alternative to the stable manifest.

## Native expressions

| Expression | Meaning |
| --- | --- |
| `d6`, `2d6`, `3d20` | Dice with integer facets 1 through N |
| `d{0,1}`, `d{-2,-1,0,1,2}` | Numeric arbitrary dice |
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
| `H[s2d6,d8]` | Compare a two-die sum with one d8 |
| `H(d4)[5d6]` | Roll d4 once to determine how many to keep |
| `(d4)d6`, `d(d{4,6,8})` | Dynamic quantity and die size |
| `2d6 | 6-:Fail; 7-9:Partial success; 10+:Success` | Interpret the numeric result using the first matching rule |

Unmarked dice retain `inferred` resolution in the AST. They resolve to a sum in ordinary numeric expressions and to individual results inside a selector's bracketed pool. Explicit `p`/`pool` or `s`/`sum` overrides that inference. Thus `H[2d6,d8]` selects from three individual rolls, while `H[s2d6,d8]` selects from two values. Commas inside `[...]` concatenate pool sources. Numeric selectors sum retained values; a single selected symbol remains symbolic. Symbolic facets cannot participate in arithmetic, and duplicate symbolic facets keep the rank of their first appearance. Parentheses only group expressions.

Each custom die facet is an equally likely branch. A branch may be a literal value, a dice expression, or text with one or more embedded expressions. No Dice chooses the branch first, then evaluates only that branch. `d{d4,d6+1,2d8}` therefore has an exact distribution equal to a one-third mixture of those three expression distributions. Text results such as `A bag of 42 gold pieces` remain categorical. A chosen branch with unlimited explosion uses the labeled estimate. Repeating a branch weights it just like repeating a literal facet. Text templates have no fixed symbolic rank, so highest/lowest selectors reject them rather than inventing an order.

Explosion is a property of a **numeric facet**. A marked facet adds another result from the same die; another marked facet continues the chain. `d6!` abbreviates `d{1,2,3,4,5,6!}`, and `d6!2` abbreviates `d{1,2,3,4,5,6!2}`. The `2` permits at most two additional rolls after the initial result, even if the second and third facets are marked. With differently limited facets, the initially selected facet sets the cap for that chain. Limited explosions have exact finite distributions when manageable; unlimited explosions are estimated. A die with no possible termination, such as `d1!`, is rejected. In symbolic or text facets, `!` is text: `d{Miss!,Hit}` returns `Miss!`. An embedded numeric expression can still explode before rendering text, as in `d{d4! dogs}`.

The notation panel shows the entered text, canonical short form, readable long form, and fully expanded long form. Short form collapses conventional facets to `dN` and omits selector count `1`; readable long form keeps conventional `dN` compact; expanded long form spells out all conventional facets. The two formatters serialize the AST independently. `H3[2d8]`, symbolic sums, nonpositive dice counts, and impossible dynamic structural values produce diagnostics rather than clamping or reinterpretation.

An optional `|` attaches a one-line interpretation table to a numeric expression. Each semicolon-separated rule is `condition:text`. Conditions may be an exact number (`7`), an inclusive range (`7-9`), a maximum (`6-` or `<=6`), or a minimum (`10+` or `>=10`); `<` and `>` are also supported. Rules are tested in written order, so the first match wins. A gap leaves the numeric result without an interpretation. Labels are literal text: `d6` or arithmetic inside a label is never rolled or evaluated. The ledger and reveal show both the numeric result and any matched label, while the probability chart remains the distribution of numeric results. Symbolic and explicit pool results cannot use a numeric interpretation table.

The Roll20 dialect selector supports common `NdM`, arithmetic, parentheses, `khN`, `klN`, `dhN`, `dlN`, `r` and `ro` with numeric comparisons, and `!`. For example, `2d20kh1+5`, `4d6dl1`, and `d6ro=1`. This is an adapter into the same AST, not a second evaluator. Roll20 success counting and unusual modifier combinations are future work.

## Probability and rolls

Valid expressions are parsed 150 ms after typing stops, then evaluated in a Web Worker. Finite distributions are exact while the state space remains under the configured threshold in `src/engine/probability.ts`. Larger or unbounded expressions use a 20,000-trial estimate, labeled as such. The chart marks the latest selected roll outcome. Numeric results use a probability mass chart and show range and mean; symbolic results show categories. The chart displays at most 80 bars at once.

**Calculate fairness** starts repeated local rolls of the current expression in a separate Web Worker. Teal bars show the accumulating observed frequencies beside the expected distribution, with the sample count beneath the chart. **Stop** preserves the observed bars for inspection. Starting again resets the sample, and editing the expression clears it. These samples do not create ledger entries, broadcast messages, or saved history. If samples produce outcomes outside the 80 visible chart bars, their count is shown below the chart.

Rolls added to the ledger while an expression is active leave muted count markers at their outcomes on the distribution chart; the latest local result remains highlighted. Matching shared rolls count too. Changing the expression or dialect clears these chart markers and recalculates the distribution. The ledger itself remains available for rerolls and editing.

Roll randomness uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias. The engine accepts an injected RNG for deterministic tests. Unlimited explosions and rerolls have a defensive 100-step limit per die to prevent pathological infinite loops.

## Roll reveal

Each permitted roll opens a separate result popover near the bottom right of every recipient's Owlbear window, even if their ledger action is closed. The canonical short expression appears immediately. Each following line starts as a translucent copy of the previous one and moves down; unchanged text stays in place while the changing terms crossfade and the line adjusts to their new length. The final **RESULT:** grows into notification blue. For example, `2d6+2` can become `[2, 3] + 2`, then `5 + 2`, then `RESULT: 7`. Steps arrive one second apart. Reduced-motion settings remove movement and fades but keep the one-second spacing. The evaluator records these reductions from the AST during the same roll. The ledger's **Show work** section uses the same steps; older saved rolls retain their earlier receipts. Intermediate lines may be shortened; the final result is never truncated. The popover remains until its dismiss button is pressed or another roll replaces it. The background page listens for everyone rolls, the sender's local self rolls, and encrypted GM rolls; it does not send private results to other players. The `background_url` manifest entry is required for this behavior.

## Multiplayer and privacy

Everyone rolls are broadcast as versioned events and appear in open No Dice ledgers and independent reveal popovers. Self rolls never leave the current client. GM rolls are encrypted with an ephemeral GM public key stored in room metadata; only the GM's background page holds the private key. The GM must have No Dice enabled in the room before a player can send a GM roll. The key changes when that background page reloads. OBR broadcasts are ephemeral, so a closed ledger can miss entries; local history stores the rolls that the ledger actually saw, capped at 100 per player and room. Scene metadata is not used for history, and rolling works even when no scene is open.

The extension is available to all players. Room metadata contains only the GM public key. The sender's own private roll is stored locally; other players see only encrypted GM payloads. As with any client extension, the result protocol does not provide a server trust guarantee against a malicious client forging messages.

## Integration API

Channels are derived from `com.ex-asperis.no-dice`:

```ts
const REQUEST_CHANNEL = 'com.ex-asperis.no-dice/roll-request/v1';
const RESULT_CHANNEL = 'com.ex-asperis.no-dice/roll-result/v1';

type RollRequest = {
  version: 1;
  requestId: string;
  expression: string;
  dialect?: 'nodice' | 'roll20';
  visibility?: 'everyone' | 'self' | 'gm';
  label?: string;
  source?: string;
};
```

Broadcast a `RollRequest` on the request channel. A GM with No Dice open evaluates it through the normal parser and evaluator. Everyone results or errors are broadcast on the result channel using the `RollResult` type in `src/protocol.ts`. Self requests are evaluated locally by the GM. GM requests are currently ignored on the public request channel because their expression would be exposed to every client; use a private integration in a future protocol version. Keep requests below 1,000 characters and use unique request IDs. External callers should subscribe to the result channel before sending.

## Architecture

`src/engine/tokenizer.ts` creates tokens with source spans. `parser.ts` turns tokens into the semantic AST in `ast.ts` and retains the original source in `parseDocument`; `interpretation.ts` parses and matches literal result tables as a separate AST node. A dice node stores its quantity, standard or custom die, and `inferred`/`pool`/`sum` mode. Custom facets are AST values, expressions, or text templates with embedded expression segments. `semantics.ts` resolves inferred modes by context in a separate pass without changing that AST, including nested facet expressions. `validate.ts` reports structured static diagnostics before rolling. `evaluate.ts` chooses a facet before evaluating its expression and builds trace steps; interpretation is applied only after the numeric value is known. `probability.ts` computes exact PMFs by mixing facet distributions independently of the random evaluator and falls back to sampling for large or unbounded cases. `format.ts` independently serializes short, readable long, and expanded long notation from the AST. `probability.worker.ts` keeps distribution work off the UI thread. `protocol.ts`, `gmCrypto.ts`, and `persistence.ts` keep room transport and local history separate from dice semantics. `App.tsx` renders the chart, ledger, notation, and input.

Dynamic forms such as `H(d4)[5d6]` and `(d4)d(d{4,6,8})` are supported; each structural parameter is rolled once. Pool selectors share one AST abstraction for future operations. Future work includes exact algorithms for larger keep/drop distributions, persistent event reception when the popover is closed, richer Roll20 compatibility, and a background receiver for integrations.
