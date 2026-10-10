# Result snapshot v1

Signal Room calculates a second Merkle root when a binary question is resolved. It commits to every forecast's signed commitment, the outcome, and the deterministic Brier score. The organizer also commits to the human-readable evidence label and URL with a separate SHA-256 hash.

All integers are encoded in little-endian form where specified. Inputs are validated before hashing.

```text
score = round(10000 - (probability_bps - outcome * 10000)^2 / 10000)
result_hash = SHA256(0x03 || commitment_hash[32] || outcome_u8 || score_u16_le)
evidence_hash = SHA256(0x04 || UTF8(evidence_label) || 0x00 || UTF8(evidence_url))
```

The result hashes are sorted lexicographically by their lowercase 64-character hex representation. The tree then uses the same prefix scheme as [commitment proof v1](MERKLE_PROOF_V1.md): `SHA256(0x00 || hash[32])` for leaves, `SHA256(0x01 || left[32] || right[32])` for parents, duplicating the final node at odd levels, and `SHA256(0x02)` for an empty tree.

At resolution, both roots and the evidence hash are calculated in the same database transition that locks the outcome. A signed-in forecaster can request their own result proof. The browser independently recomputes the result hash from the signed forecast receipt and the public outcome, verifies Merkle inclusion, and checks the evidence hash.

Current limitation: these roots are stored by the app and are **not yet anchored on Solana**. Browser verification detects mismatch against the app's published root, but an operator could replace both the root and its underlying data. The Anchor program and generated client are ready for the next step; deploying it and requiring confirmed onchain writes before marking a question anchored is separate work.
