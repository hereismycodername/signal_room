# Signal Room commitment proof v1

This format freezes the offchain commitments present when an organizer seals a question. It is independent of the future Solana transaction format. The app stores the root and count in its database; **the root is not yet anchored onchain**.

## Canonical tree

1. A commitment is `SHA-256(UTF-8(forecast signing message))`, represented as 64 lowercase hex characters. Its message includes room ID, question ID, wallet address, probability in basis points, salt, and chain ID.
2. Sort commitment hex strings lexicographically in ascending order. Duplicate commitments are invalid.
3. Decode each commitment to 32 bytes. A leaf is `SHA-256(0x00 || commitment_bytes)`.
4. A parent is `SHA-256(0x01 || left_32_bytes || right_32_bytes)`. If a level has an odd final node, pair that node with itself. Repeat until one root remains.
5. The root for an empty tree is `SHA-256(0x02)`. Store the root as 64 lowercase hex characters alongside the commitment count.

A proof is an ordered array from the leaf upward. Each step contains the sibling hash and its position (`left` or `right`) relative to the current node. To verify, recompute the leaf and every parent, then compare the final 32 bytes with the published root. The server returns a proof only to the wallet that submitted the forecast, after sealing. The browser verifies it independently using Web Crypto.

Fixed vector: for commitments `SHA-256("alpha")`, `SHA-256("beta")`, and `SHA-256("gamma")`, the root is `50a28e5bbec7b4f84b0ba8c92515caa389db1da50f37530fef003c2859a140bd`.

## Trust boundary

The proof shows that a commitment belongs to the published root. It does not prove that the server published the complete set, that the published root existed at the claimed time, or that the root cannot later be replaced. Solana anchoring and a verifiable result/score root are separate milestones. Until then, the app remains the authority for the root and the outcome.
