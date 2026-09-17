# No Dice verifiable roll V1

This optional client-only protocol uses the Owlbear room broadcast channel
`com.ex-asperis.no-dice/verifiable-roll/v1`. It requires two reachable No Dice
clients. Presence (`hello`, `ping`, `ack`) is versioned and expires after 30
seconds; Owlbear party changes remove disconnected clients immediately. The
sender is always the connection ID on the broadcast event, never a data field.

The roller chooses one peer: players prefer a GM, otherwise the lowest
connection ID; GMs choose the lowest player connection ID. A roll request
contains a UUID, room ID, both connection IDs, and `formatShort` of the parsed
AST (plus its dialect). The peer parses and checks that it produces the same
canonical expression. This version is `NODICE_VERIFIABLE_ROLL_V1`.

Both clients draw 32 fresh bytes from `crypto.getRandomValues`. Hash inputs
are UTF-8 JSON arrays, with the exact positions below (JSON escaping provides
unambiguous boundaries). Hashes and secrets are lowercase hex. Define
`I = [version, roomId, rollId, rollerConnectionId, peerConnectionId, expression]`.
The commitment is `SHA-256(JSON(["commit", ...I, contributorConnectionId,
secretHex]))`. A client sends `commit` before `reveal`; it reveals only once it
has both commitments. Each received reveal must hash to its prior commitment.
Duplicate identical messages are harmless; conflicting or out-of-order
messages fail the session. Sessions time out after eight seconds.

The final seed is `SHA-256(JSON(["final-seed", ...I, ...contributions]))`, where
`contributions` consists of `[connectionId, secretHex]` pairs sorted by
connection ID. The shared seed drives SHA-256 blocks over UTF-8
`"No Dice verified RNG V1\0"`, the 32 seed bytes, and a big-endian uint32
counter starting at zero. Each block supplies consecutive big-endian uint32
values. The existing evaluator's rejection sampling maps those values into
die faces without modulo bias. No result message is authoritative: both
clients evaluate with the same evaluator and RNG stream.

Before two commitments exist, a lost peer permits an ordinary local roll.
After both commitments, failure creates an error receipt without a reroll.
The existing external extension API remains a normal local roll to preserve
its synchronous-response behavior and existing contract. Version 0.20.0 adds
the optional room setting and verification receipt without changing the dice
grammar or V1 result/request wire formats; the optional verification field is
additive. The verification protocol has its own V1 version independent of the
extension release version.
