# No Dice verifiable roll V2

V2 retains the V1 commit/reveal and seeded-RNG construction described in
[the V1 specification](verifiable-roll-v1.md), with these exact changes:

- Broadcast channel: `com.ex-asperis.no-dice/verifiable-roll/v2`.
- Protocol string (including in every commitment and final-seed hash input):
  `NODICE_VERIFIABLE_ROLL_V2`.
- Operands are evaluated left to right within each operation (after ordinary
  parentheses and arithmetic precedence). A die's quantity resolves before
  its size. For a custom die, all initial facets are selected in order before
  their nested expressions are evaluated in that same order. Every selection
  and nested evaluation consumes the shared seeded RNG stream. For example,
  `(d2)d{d4,d6,d8,d10,d12,d20}` with zero-based RNG values
  `1,2,0,4,2` reduces to `2d{d4,d6,d8,d10,d12,d20}`, `[d8, d4]`,
  `[5, d4]`, `[5, 3]`, then `8`.

All other V1 fields, canonical expression formatting, SHA-256 JSON-array
serialization, contributor ordering, 32-byte secrets, timeout and failure
rules, and counter-mode RNG byte order are unchanged. V2 presence messages
only accept V2 peers, so mixed-version clients cannot independently compute
different outcomes for the same verified roll. The public extension API is
unchanged and continues to perform local rolls.

A trailing top-level `# name` is presentation metadata. It is preserved in
the submitted expression and history, but omitted from the parsed AST and
therefore from the canonical roll expression and commitment input.
