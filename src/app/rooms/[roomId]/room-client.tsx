"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSignalWallet } from "@/app/providers";
import { WalletButton } from "@/components/wallet-button";
import type { BinaryOutcome, QuestionStatus } from "@/lib/forecasting";
import { evidenceHashInBrowser, resultHashInBrowser, verifyCommitmentProofInBrowser } from "@/lib/merkle-browser";
import type { MerkleProofStep } from "@/lib/merkle";
import { brierScoreBps, type RoomLeaderboardEntry } from "@/lib/room-results";
import styles from "./room.module.css";

type PublicQuestion = {
  id: string;
  prompt: string;
  category: string;
  resolutionCriteria: string;
  closesAt: string;
  status: QuestionStatus;
  forecastCount: number;
  commitmentsRoot: string | null;
  commitmentCount: number | null;
  resultsRoot: string | null;
  evidenceHash: string | null;
  aggregateProbabilityBps: number | null;
  histogram: number[] | null;
  outcome: BinaryOutcome | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
};

type PublicRoom = {
  id: string;
  name: string;
  description: string;
  questions: PublicQuestion[];
};

type ForecastReceipt = {
  probabilityBps: number;
  commitmentHash: string;
  submittedAt: string;
};

type RoomResponse = {
  room: PublicRoom;
  leaderboard: RoomLeaderboardEntry[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function shortAddress(address: string) {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

function scoreLabel(score: number) {
  return (score / 100).toFixed(1);
}

export function PublicRoomClient() {
  const { roomId } = useParams<{ roomId: string }>();
  const { address, busy, submitSignedForecast } = useSignalWallet();
  const [roomState, setRoomState] = useState<RoomResponse | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, ForecastReceipt>>({});
  const [probability, setProbability] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proofStatus, setProofStatus] = useState<Record<string, "checking" | "verified" | "failed">>({});
  const [clockMs, setClockMs] = useState(0);

  const refreshRoom = useCallback(async () => {
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as RoomResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load this room.");
      setRoomState(result);
      setClockMs(Date.now());
      setLoadingError(null);
    } catch (cause) {
      setLoadingError(
        cause instanceof Error ? cause.message : "Could not load this room.",
      );
    }
  }, [roomId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as RoomResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load this room.");
        return result;
      })
      .then((result) => {
        if (!active) return;
        setRoomState(result);
        setClockMs(Date.now());
        setLoadingError(null);
      })
      .catch((cause) => {
        if (active) setLoadingError(cause instanceof Error ? cause.message : "Could not load this room.");
      });
    const interval = window.setInterval(() => void refreshRoom(), 20_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshRoom, roomId]);

  const room = roomState?.room.id === roomId ? roomState.room : null;
  const leaderboard = room ? roomState?.leaderboard ?? [] : [];
  const question =
    room?.questions.find((item) => item.id === selectedQuestionId) ??
    room?.questions[0] ??
    null;
  const questionId = question?.id;
  const receiptKey = address && question ? `${address}:${question.id}` : null;
  const ownReceipt = receiptKey ? receipts[receiptKey] : null;
  const proofKey = receiptKey && question?.commitmentsRoot
    ? `${receiptKey}:${question.commitmentsRoot}:${question.resultsRoot ?? ""}`
    : null;
  const deadlinePassed = question
    ? new Date(question.closesAt).getTime() <= clockMs
    : false;
  const openCount = room?.questions.filter((item) => item.status === "open").length ?? 0;
  const resolvedCount =
    room?.questions.filter((item) => item.status === "resolved").length ?? 0;

  useEffect(() => {
    if (!address || !questionId) return;
    const key = `${address}:${questionId}`;
    let active = true;
    fetch(
      `/api/rooms/${encodeURIComponent(roomId)}/questions/${encodeURIComponent(questionId)}/forecasts`,
      { cache: "no-store" },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { forecast?: ForecastReceipt | null } | null) => {
        const forecast = result?.forecast;
        if (active && forecast) {
          setReceipts((current) => ({ ...current, [key]: forecast }));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [address, roomId, questionId]);

  async function submitForecast() {
    if (!question || !address || submitting) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await submitSignedForecast({
        roomId,
        questionId: question.id,
        probability,
      });
      setReceipts((current) => ({
        ...current,
        [`${address}:${question.id}`]: {
          probabilityBps: result.probability * 100,
          commitmentHash: result.commitmentHash,
          submittedAt: result.submittedAt,
        },
      }));
      setNotice(`Your ${result.probability}% forecast is signed and locked.`);
      await refreshRoom();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not submit forecast.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyRoomLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Room link copied. Invite participants to forecast independently.");
    } catch {
      setNotice("Copy the room URL from the address bar to share it.");
    }
  }

  async function verifyOwnProof() {
    if (!question || !ownReceipt || !proofKey || !question.commitmentsRoot) return;
    setProofStatus((current) => ({ ...current, [proofKey]: "checking" }));
    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(roomId)}/questions/${encodeURIComponent(question.id)}/proof`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        error?: string;
        commitmentHash?: string;
        root?: string;
        count?: number;
        proof?: MerkleProofStep[];
        algorithm?: string;
        result?: {
          hash: string;
          root: string;
          count: number;
          proof: MerkleProofStep[];
          outcome: BinaryOutcome;
          score: number;
        } | null;
      };
      if (!response.ok) throw new Error(result.error ?? "Could not load your proof.");
      let verified = result.commitmentHash === ownReceipt.commitmentHash &&
        result.root === question.commitmentsRoot &&
        result.count === question.commitmentCount &&
        result.algorithm === "sha256-prefix-v1" &&
        Array.isArray(result.proof) &&
        await verifyCommitmentProofInBrowser(result.commitmentHash, result.root!, result.proof);
      if (verified && question.status === "resolved") {
        const scoreResult = result.result;
        verified = !!scoreResult && question.outcome !== null && !!question.resultsRoot &&
          !!question.evidenceHash && !!question.evidenceLabel && !!question.evidenceUrl &&
          scoreResult.root === question.resultsRoot &&
          scoreResult.count === question.commitmentCount &&
          scoreResult.outcome === question.outcome &&
          scoreResult.score === brierScoreBps(ownReceipt.probabilityBps, question.outcome) &&
          scoreResult.hash === await resultHashInBrowser(
            ownReceipt.commitmentHash,
            ownReceipt.probabilityBps,
            question.outcome,
          ) &&
          Array.isArray(scoreResult.proof) &&
          await verifyCommitmentProofInBrowser(scoreResult.hash, scoreResult.root, scoreResult.proof) &&
          question.evidenceHash === await evidenceHashInBrowser(question.evidenceLabel, question.evidenceUrl);
      }
      setProofStatus((current) => ({ ...current, [proofKey]: verified ? "verified" : "failed" }));
    } catch (cause) {
      setProofStatus((current) => ({ ...current, [proofKey]: "failed" }));
      setNotice(cause instanceof Error ? cause.message : "Could not check your proof.");
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span>SR</span>
          <strong>SIGNAL ROOM</strong>
        </Link>
        <nav aria-label="Room navigation">
          <Link href="/">Demo</Link>
          <Link href="/studio">Organizer Studio</Link>
        </nav>
        <WalletButton />
      </header>

      {!room ? (
        <section className={styles.loadState}>
          <p>PUBLIC FORECAST ROOM</p>
          <h1>{loadingError ?? "Loading the room…"}</h1>
          {loadingError && (
            <button type="button" onClick={() => void refreshRoom()}>
              Try again
            </button>
          )}
        </section>
      ) : (
        <>
          <section className={styles.hero}>
            <div>
              <p>PUBLIC FORECAST ROOM · SIGNED PARTICIPATION</p>
              <h1>{room.name}</h1>
              <span>{room.description}</span>
            </div>
            <div className={styles.heroActions}>
              <button type="button" onClick={() => void copyRoomLink()}>
                Share room ↗
              </button>
              <button type="button" onClick={() => void refreshRoom()}>
                Refresh results ↻
              </button>
            </div>
          </section>

          <section className={styles.facts} aria-label="Room overview">
            <div><strong>{room.questions.length}</strong><span>Published questions</span></div>
            <div><strong>{openCount}</strong><span>Open for forecasts</span></div>
            <div><strong>{resolvedCount}</strong><span>Resolved with evidence</span></div>
            <div><strong>{leaderboard.length}</strong><span>Ranked participants</span></div>
          </section>

          {room.questions.length === 0 ? (
            <section className={styles.emptyRoom}>
              <h2>No public questions yet.</h2>
              <p>The organizer is preparing the first question. Come back after it opens.</p>
            </section>
          ) : (
            <section className={styles.workspace}>
              <aside className={styles.sidebar} aria-label="Questions">
                <div className={styles.panelHeading}>
                  <span>Questions</span>
                  <small>{room.questions.length} published</small>
                </div>
                {room.questions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={item.id === question?.id ? styles.selected : ""}
                    aria-pressed={item.id === question?.id}
                    onClick={() => {
                      setSelectedQuestionId(item.id);
                      setProbability(50);
                      setNotice(null);
                    }}
                  >
                    <i data-status={item.status} />
                    <span><strong>{item.prompt}</strong><small>{item.status} · {item.forecastCount} forecasts</small></span>
                  </button>
                ))}
              </aside>

              {question && (
                <article className={styles.forecastCard}>
                  <div className={styles.questionMeta}>
                    <span data-status={question.status}>{question.status}</span>
                    <span>{question.category}</span>
                    <time dateTime={question.closesAt}>Closes {formatDate(question.closesAt)}</time>
                  </div>
                  <h2>{question.prompt}</h2>
                  <div className={styles.criteria}>
                    <strong>Resolution criteria</strong>
                    <p>{question.resolutionCriteria}</p>
                  </div>

                  {question.status === "open" && !deadlinePassed && (
                    <div className={styles.actionArea}>
                      {ownReceipt ? (
                        <div className={styles.receipt}>
                          <span>Your signed forecast</span>
                          <strong>{ownReceipt.probabilityBps / 100}%</strong>
                          <p>Locked before the deadline. Other probabilities stay hidden until the organizer seals this question.</p>
                          <small>Receipt SHA-256: {ownReceipt.commitmentHash}</small>
                        </div>
                      ) : address ? (
                        <>
                          <div className={styles.probabilityLabel}>
                            <div><span>Your probability</span><small>How likely is YES?</small></div>
                            <output htmlFor="room-probability">{probability}%</output>
                          </div>
                          <input
                            id="room-probability"
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={probability}
                            onChange={(event) => setProbability(Number(event.target.value))}
                            style={{ "--fill": `${probability}%` } as React.CSSProperties}
                          />
                          <div className={styles.rangeLabels}><span>NO</span><span>UNCERTAIN</span><span>YES</span></div>
                          <button
                            type="button"
                            className={styles.submit}
                            disabled={submitting || busy}
                            onClick={() => void submitForecast()}
                          >
                            {submitting ? "Waiting for signature…" : `Sign & lock ${probability}%`} <span>→</span>
                          </button>
                          <p className={styles.note}>Signing is free. Your wallet will not send a transaction.</p>
                        </>
                      ) : (
                        <div className={styles.connectPrompt}>
                          <span>Ready to forecast?</span>
                          <p>Connect a Solana wallet to sign your answer. You can read results without one.</p>
                          <WalletButton />
                        </div>
                      )}
                    </div>
                  )}

                  {question.status === "open" && deadlinePassed && (
                    <div className={styles.waiting}>
                      <strong>Forecast deadline passed.</strong>
                      <p>New answers are closed. The organizer will seal the question and reveal the group distribution.</p>
                    </div>
                  )}

                  {(question.status === "sealed" || question.status === "resolved") && (
                    <div className={styles.results}>
                      <div className={styles.aggregate}>
                        <span>Room consensus</span>
                        <strong>
                          {question.aggregateProbabilityBps === null
                            ? "—"
                            : `${(question.aggregateProbabilityBps / 100).toFixed(1)}%`}
                        </strong>
                        <small>{question.forecastCount} signed forecasts</small>
                      </div>
                      <div className={styles.distribution} aria-label="Forecast distribution">
                        {(question.histogram ?? [0, 0, 0, 0, 0]).map((count, index) => (
                          <div key={index}>
                            <span style={{ height: `${question.forecastCount ? Math.max(8, count / question.forecastCount * 100) : 8}%` }}>
                              <i>{count}</i>
                            </span>
                            <small>{index * 20}–{index === 4 ? 100 : index * 20 + 19}</small>
                          </div>
                        ))}
                      </div>
                      <div className={styles.proofPanel}>
                        <span>Sealed commitment snapshot · not onchain yet</span>
                        {question.commitmentsRoot ? (
                          <>
                            <code>{question.commitmentsRoot}</code>
                            <small>{question.commitmentCount} signed commitments in this Merkle root.</small>
                            {ownReceipt && (
                              <button type="button" onClick={() => void verifyOwnProof()} disabled={proofKey ? proofStatus[proofKey] === "checking" : true}>
                                {proofKey && proofStatus[proofKey] === "checking" ? "Checking…" : question.status === "resolved" ? "Verify forecast and score" : "Verify my forecast inclusion"}
                              </button>
                            )}
                            {proofKey && proofStatus[proofKey] === "verified" && <strong role="status">Proof verified in this browser ✓</strong>}
                            {proofKey && proofStatus[proofKey] === "failed" && <strong role="alert">Proof check failed. Do not trust this snapshot.</strong>}
                          </>
                        ) : <small>This older question has no sealed snapshot.</small>}
                      </div>
                      {question.status === "resolved" && question.outcome !== null && (
                        <div className={styles.outcome}>
                          <div><span>Final result</span><strong>{question.outcome === 1 ? "YES" : "NO"}</strong></div>
                          <div>
                            <span>Evidence</span>
                            {question.evidenceUrl ? (
                              <a href={question.evidenceUrl} target="_blank" rel="noreferrer">
                                {question.evidenceLabel} ↗
                              </a>
                            ) : <strong>Source pending</strong>}
                          </div>
                          {ownReceipt && (
                            <div><span>Your Brier score</span><strong>{scoreLabel(brierScoreBps(ownReceipt.probabilityBps, question.outcome))}</strong></div>
                          )}
                          {question.resultsRoot && (
                            <div><span>Score snapshot · not onchain yet</span><code>{question.resultsRoot}</code></div>
                          )}
                        </div>
                      )}
                      {ownReceipt && (
                        <div className={styles.revealedReceipt}>
                          <strong>Your signed forecast: {ownReceipt.probabilityBps / 100}%</strong>
                          <small>Receipt SHA-256: {ownReceipt.commitmentHash}</small>
                        </div>
                      )}
                    </div>
                  )}

                  {notice && <p className={styles.notice} role="status">{notice}</p>}
                </article>
              )}

              <aside className={styles.leaderboard}>
                <div className={styles.panelHeading}><span>Accuracy board</span><small>Brier score</small></div>
                <p>Ranked by average accuracy on resolved questions. Three results remove provisional status.</p>
                {leaderboard.length === 0 ? (
                  <div className={styles.emptyBoard}>The first rankings appear after a question is resolved.</div>
                ) : (
                  leaderboard.map((entry, index) => (
                    <div
                      key={entry.walletAddress}
                      className={`${styles.rankRow} ${entry.walletAddress === address ? styles.ownRank : ""}`}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong title={entry.walletAddress}>{shortAddress(entry.walletAddress)}</strong>
                        <small>{entry.resolvedForecasts} resolved · {entry.directionAccuracy}% direction</small>
                        {entry.provisional && <small>Provisional</small>}
                      </div>
                      <b>{scoreLabel(entry.averageScore)}</b>
                    </div>
                  ))
                )}
              </aside>
            </section>
          )}
        </>
      )}
    </main>
  );
}
