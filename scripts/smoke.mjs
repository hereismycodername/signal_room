import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { generateKeyPairSigner, signBytes } from "@solana/kit";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const encoder = new TextEncoder();

async function request(path, { method = "GET", cookie, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null,
  };
}

function expectStatus(response, status) {
  assert.equal(response.status, status, JSON.stringify(response.body));
  return response.body;
}

async function sign(signer, message) {
  const signature = await signBytes(signer.keyPair.privateKey, encoder.encode(message));
  return Buffer.from(signature).toString("base64");
}

async function signIn(signer) {
  const nonceResponse = await request("/api/auth/nonce", {
    method: "POST",
    body: { address: signer.address },
  });
  const nonce = expectStatus(nonceResponse, 200);
  assert.equal(
    nonce.storage,
    "memory",
    "Smoke test only runs against the local in-memory store.",
  );
  const verifiedResponse = await request("/api/auth/verify", {
    method: "POST",
    body: {
      address: signer.address,
      nonceId: nonce.id,
      signature: await sign(signer, nonce.message),
    },
  });
  expectStatus(verifiedResponse, 200);
  assert.ok(verifiedResponse.cookie);
  return verifiedResponse.cookie;
}

function forecastMessage({ roomId, questionId, address, probabilityBps, salt }) {
  return `Signal Room Forecast v1
Room: ${roomId}
Question: ${questionId}
Wallet: ${address}
Probability BPS: ${probabilityBps}
Salt: ${salt}
Chain ID: solana:devnet

Signing records this forecast. It does not submit a transaction or spend SOL.`;
}

function verifiesProof(commitmentHash, root, proof) {
  const hash = (bytes) => createHash("sha256").update(bytes).digest();
  let current = hash(Buffer.concat([Buffer.from([0]), Buffer.from(commitmentHash, "hex")]));
  for (const step of proof) {
    const sibling = Buffer.from(step.sibling, "hex");
    current = hash(step.position === "left"
      ? Buffer.concat([Buffer.from([1]), sibling, current])
      : Buffer.concat([Buffer.from([1]), current, sibling]));
  }
  return current.toString("hex") === root;
}

async function submitForecast(signer, cookie, roomId, questionId, probabilityBps) {
  const salt = randomBytes(24).toString("base64url");
  const signature = await sign(
    signer,
    forecastMessage({
      roomId,
      questionId,
      address: signer.address,
      probabilityBps,
      salt,
    }),
  );
  return request(`/api/rooms/${roomId}/questions/${questionId}/forecasts`, {
    method: "POST",
    cookie,
    body: { probabilityBps, salt, signature },
  });
}

const organizer = await generateKeyPairSigner();
const participant = await generateKeyPairSigner();
const organizerCookie = await signIn(organizer);
const participantCookie = await signIn(participant);

const roomResponse = await request("/api/studio/rooms", {
  method: "POST",
  cookie: organizerCookie,
  body: {
    name: `Smoke room ${randomBytes(3).toString("hex")}`,
    description: "A local two-wallet check of the complete forecast lifecycle.",
  },
});
const roomId = expectStatus(roomResponse, 201).room.id;

const questionResponse = await request(`/api/studio/rooms/${roomId}/questions`, {
  method: "POST",
  cookie: organizerCookie,
  body: {
    prompt: "Will this smoke test finish with two ranked participants?",
    category: "Testing",
    resolutionCriteria:
      "YES if both test wallets appear in the final public leaderboard.",
    closesAt: new Date(Date.now() + 8_000).toISOString(),
  },
});
const questionId = expectStatus(questionResponse, 201).question.id;

const transitionPath = `/api/studio/questions/${questionId}/transition`;
expectStatus(
  await request(transitionPath, {
    method: "POST",
    cookie: participantCookie,
    body: { action: "open" },
  }),
  403,
);
expectStatus(
  await request(transitionPath, {
    method: "POST",
    cookie: organizerCookie,
    body: { action: "open" },
  }),
  200,
);

expectStatus(await submitForecast(organizer, organizerCookie, roomId, questionId, 8_000), 201);
expectStatus(await submitForecast(participant, participantCookie, roomId, questionId, 2_000), 201);
expectStatus(await submitForecast(participant, participantCookie, roomId, questionId, 6_000), 409);

const publicPath = `/api/rooms/${roomId}`;
const openRoom = expectStatus(await request(publicPath), 200);
assert.equal(openRoom.room.questions[0].forecastCount, 2);
assert.equal(openRoom.room.questions[0].aggregateProbabilityBps, null);
assert.equal(openRoom.room.questions[0].histogram, null);
assert.equal(openRoom.room.questions[0].commitmentsRoot, null);
assert.deepEqual(openRoom.leaderboard, []);
assert.equal(JSON.stringify(openRoom).includes(organizer.address), false);
assert.equal(JSON.stringify(openRoom).includes(participant.address), false);

const proofPath = `/api/rooms/${roomId}/questions/${questionId}/proof`;
expectStatus(await request(proofPath, { cookie: participantCookie }), 409);

expectStatus(
  await request(transitionPath, {
    method: "POST",
    cookie: organizerCookie,
    body: { action: "seal" },
  }),
  409,
);
await new Promise((resolve) => setTimeout(resolve, Math.max(0, new Date(questionResponse.body.question.closesAt).getTime() - Date.now() + 150)));

expectStatus(
  await request(transitionPath, {
    method: "POST",
    cookie: organizerCookie,
    body: { action: "seal" },
  }),
  200,
);
const sealedRoom = expectStatus(await request(publicPath), 200);
assert.equal(sealedRoom.room.questions[0].aggregateProbabilityBps, 5_000);
assert.equal(sealedRoom.room.questions[0].commitmentCount, 2);
assert.match(sealedRoom.room.questions[0].commitmentsRoot, /^[0-9a-f]{64}$/);

const participantProof = expectStatus(await request(proofPath, { cookie: participantCookie }), 200);
assert.equal(participantProof.root, sealedRoom.room.questions[0].commitmentsRoot);
assert.equal(participantProof.anchored, false);
assert.equal(verifiesProof(participantProof.commitmentHash, participantProof.root, participantProof.proof), true);
expectStatus(await request(proofPath), 401);
expectStatus(await submitForecast(participant, participantCookie, roomId, questionId, 5_000), 409);

expectStatus(
  await request(transitionPath, {
    method: "POST",
    cookie: organizerCookie,
    body: {
      action: "resolve",
      outcome: 1,
      evidenceLabel: "Smoke test result",
      evidenceUrl: "https://example.org/signal-room-smoke",
    },
  }),
  200,
);
const resolvedRoom = expectStatus(await request(publicPath), 200);
assert.match(resolvedRoom.room.questions[0].resultsRoot, /^[0-9a-f]{64}$/);
assert.match(resolvedRoom.room.questions[0].evidenceHash, /^[0-9a-f]{64}$/);
assert.deepEqual(
  resolvedRoom.leaderboard.map((entry) => entry.walletAddress),
  [organizer.address, participant.address],
);
assert.equal(resolvedRoom.leaderboard[0].averageScore, 9_600);
assert.equal(resolvedRoom.leaderboard[1].averageScore, 3_600);

const receipt = expectStatus(
  await request(`/api/rooms/${roomId}/questions/${questionId}/forecasts`, {
    cookie: participantCookie,
  }),
  200,
);
assert.equal(receipt.forecast.probabilityBps, 2_000);
assert.equal(receipt.forecast.commitmentHash.length, 64);

const resolvedProof = expectStatus(await request(proofPath, { cookie: participantCookie }), 200);
assert.equal(resolvedProof.result.root, resolvedRoom.room.questions[0].resultsRoot);
assert.equal(resolvedProof.result.score, 3_600);
assert.equal(verifiesProof(resolvedProof.result.hash, resolvedProof.result.root, resolvedProof.result.proof), true);

console.log(`Smoke passed: two signed wallets, privacy, roles, deadline, commitment and score proofs, resolution, ranking. Room: /rooms/${roomId}`);
