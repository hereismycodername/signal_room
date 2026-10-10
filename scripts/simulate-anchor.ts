import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  generateKeyPairSigner,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  type Instruction,
} from "@solana/kit";
import { Clock, FailedTransactionMetadata, LiteSVM, type SimulatedTransactionInfo } from "litesvm";
import {
  decodeQuestion,
  getCreateQuestionInstructionAsync,
  getCreateRoomInstructionAsync,
  getResolveQuestionInstruction,
  getSealQuestionInstruction,
  QuestionStatus,
  SIGNAL_ROOM_PROGRAM_ADDRESS,
} from "../src/generated/index";

async function main() {
  const programPath = resolve("target/deploy/signal_room.so");
  const svm = new LiteSVM().withSigverify(false);
  svm.addProgramFromFile(SIGNAL_ROOM_PROGRAM_ADDRESS, programPath);

  const authority = await generateKeyPairSigner();
  svm.setAccount({
    address: authority.address,
    data: new Uint8Array(),
    executable: false,
    lamports: lamports(1_000_000_000n),
    programAddress: address("11111111111111111111111111111111"),
    space: 0n,
  });

  function simulate(instruction: Instruction) {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(authority, tx),
      (tx) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(tx),
      (tx) => appendTransactionMessageInstruction(instruction, tx),
    );
    // No signatures are produced and no transaction is submitted.
    return svm.simulateTransaction(compileTransaction(message));
  }

  function expectSuccess(result: ReturnType<typeof simulate>, label: string): SimulatedTransactionInfo {
    if (result instanceof FailedTransactionMetadata) {
      throw new Error(`${label} simulation failed: ${result.err()}\n${result.meta().logs().join("\n")}`);
    }
    return result;
  }

  function saveSimulatedAccount(result: SimulatedTransactionInfo, accountAddress: string) {
    const account = result.postAccounts().find((item) => item.address === accountAddress);
    assert.ok(account, `Simulation did not produce account ${accountAddress}`);
    svm.setAccount(account);
  }

  const createRoom = await getCreateRoomInstructionAsync({
    authority,
    roomId: new Uint8Array(16).fill(7),
    metadataHash: new Uint8Array(32).fill(8),
  });
  const roomAddress = createRoom.accounts[1].address;
  const roomCreated = expectSuccess(simulate(createRoom), "create_room");
  assert.equal(svm.getAccount(roomAddress).exists, false);
  saveSimulatedAccount(roomCreated, roomAddress);

  const createQuestion = await getCreateQuestionInstructionAsync({
    authority,
    room: roomAddress,
    questionIndex: 0,
    metadataHash: new Uint8Array(32).fill(9),
    closesAt: 100n,
  });
  const questionAddress = createQuestion.accounts[2].address;
  const questionCreated = expectSuccess(simulate(createQuestion), "create_question");
  saveSimulatedAccount(questionCreated, roomAddress);
  saveSimulatedAccount(questionCreated, questionAddress);

  const seal = getSealQuestionInstruction({
    authority,
    room: roomAddress,
    question: questionAddress,
    commitmentsRoot: new Uint8Array(32).fill(1),
    commitmentCount: 2,
  });
  assert.ok(simulate(seal) instanceof FailedTransactionMetadata, "Seal before deadline must fail");

  const currentClock = svm.getClock();
  svm.setClock(new Clock(
    currentClock.slot,
    currentClock.epochStartTimestamp,
    currentClock.epoch,
    currentClock.leaderScheduleEpoch,
    100n,
  ));
  const stranger = await generateKeyPairSigner();
  const wrongAuthority = getSealQuestionInstruction({
    authority: stranger,
    room: roomAddress,
    question: questionAddress,
    commitmentsRoot: new Uint8Array(32).fill(1),
    commitmentCount: 2,
  });
  const unauthorized = simulate(wrongAuthority);
  assert.ok(unauthorized instanceof FailedTransactionMetadata, "Wrong authority must fail after the deadline");
  assert.ok(
    unauthorized.meta().logs().some((line) => line.includes("ConstraintSeeds") && line.includes("account: room")),
    "Wrong authority must fail the room PDA seed check",
  );

  const sealed = expectSuccess(simulate(seal), "seal_question");
  saveSimulatedAccount(sealed, questionAddress);
  assert.ok(simulate(seal) instanceof FailedTransactionMetadata, "Repeated seal must fail");

  const resolveQuestion = getResolveQuestionInstruction({
    authority,
    room: roomAddress,
    question: questionAddress,
    outcome: 1,
    resultsRoot: new Uint8Array(32).fill(2),
    evidenceHash: new Uint8Array(32).fill(3),
  });
  const resolved = expectSuccess(simulate(resolveQuestion), "resolve_question");
  const resolvedAccount = resolved.postAccounts().find((item) => item.address === questionAddress);
  assert.ok(resolvedAccount);
  const decoded = decodeQuestion(resolvedAccount);
  assert.equal(decoded.data.status, QuestionStatus.Resolved);
  assert.equal(decoded.data.outcome.__option, "Some");
  saveSimulatedAccount(resolved, questionAddress);
  assert.ok(simulate(resolveQuestion) instanceof FailedTransactionMetadata, "Repeated resolve must fail");

  console.log(`Anchor lifecycle simulation passed without signing or sending: create room/question, deadline, authority, seal, resolve. Create-room compute units: ${roomCreated.meta().computeUnitsConsumed()}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
