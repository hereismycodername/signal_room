"use client";

import { useEffect, useMemo, useState } from "react";
import { useSignalWallet } from "@/app/providers";
import { WalletButton } from "@/components/wallet-button";
import { CURRENT_PARTICIPANT, DEMO_ROOM } from "@/lib/demo-room";
import {
  aggregateProbability,
  brierScorePoints,
  buildHistogram,
  buildLeaderboard,
  canTransition,
  type BinaryOutcome,
  type Question,
} from "@/lib/forecasting";

const statusCopy = {
  open: "Open",
  sealed: "Sealed",
  resolved: "Resolved",
} as const;

function SignalMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 40" className="signal-mark">
      <path d="M7 26.5 13.5 20l5 5L31 12.5" />
      <path d="M7 13.5h6.5V20H20" />
      <circle cx="31" cy="12.5" r="3" />
    </svg>
  );
}

function formatScore(score: number) {
  return (score / 100).toFixed(1);
}

function QuestionListItem({
  question,
  active,
  onSelect,
}: {
  question: Question;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`question-list-item ${active ? "active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className={`status-dot ${question.status}`} />
      <span className="question-list-copy">
        <strong>{question.prompt}</strong>
        <small>
          {statusCopy[question.status]} · {question.forecasts.length} forecasts
        </small>
      </span>
      <span aria-hidden="true" className="list-arrow">
        ↗
      </span>
    </button>
  );
}

export default function Home() {
  const { address, session, busy, error: walletError, submitSignedForecast } = useSignalWallet();
  const [questions, setQuestions] = useState(DEMO_ROOM.questions);
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    DEMO_ROOM.questions[0].id,
  );
  const [probability, setProbability] = useState(68);
  const [notice, setNotice] = useState<string | null>(null);

  const question = questions.find((item) => item.id === selectedQuestionId)!;
  const ownForecast = question.forecasts.find(
    (forecast) =>
      forecast.participantId === CURRENT_PARTICIPANT.id ||
      (address !== null && forecast.participantId === address),
  );
  const aggregate = aggregateProbability(question.forecasts);
  const histogram = buildHistogram(question.forecasts);
  const maxBucket = Math.max(...histogram, 1);
  const leaderboard = useMemo(() => buildLeaderboard(questions), [questions]);
  const resolvedCount = questions.filter(
    (item) => item.status === "resolved",
  ).length;
  const openCount = questions.filter((item) => item.status === "open").length;

  useEffect(() => {
    if (!address || question.status !== "open") return;
    let active = true;

    fetch(`/api/rooms/${DEMO_ROOM.id}/questions/${question.id}/forecasts`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: { forecast?: { probabilityBps: number; submittedAt: string } } | null) => {
        if (!active || !value?.forecast) return;
        const storedForecast = value.forecast;
        setQuestions((items) =>
          items.map((item) => {
            if (
              item.id !== question.id ||
              item.forecasts.some((forecast) => forecast.participantId === address)
            ) {
              return item;
            }
            return {
              ...item,
              forecasts: [
                ...item.forecasts,
                {
                  id: `${item.id}-${address}`,
                  participantId: address,
                  participantName: `${address.slice(0, 4)}…${address.slice(-4)}`,
                  probability: storedForecast.probabilityBps / 100,
                  submittedAt: storedForecast.submittedAt,
                },
              ],
            };
          }),
        );
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [address, question.id, question.status]);

  function selectQuestion(id: string) {
    setSelectedQuestionId(id);
    setProbability(68);
    setNotice(null);
  }

  async function submitForecast() {
    if (question.status !== "open" || ownForecast) return;

    if (!address) {
      setNotice("Connect and verify a Solana wallet first. Signing is free and creates no transaction.");
      return;
    }

    try {
      const saved = await submitSignedForecast({
        roomId: DEMO_ROOM.id,
        questionId: question.id,
        probability,
      });

      setQuestions((items) =>
        items.map((item) =>
          item.id === question.id
            ? {
                ...item,
                forecasts: [
                  ...item.forecasts,
                  {
                    id: `${item.id}-${address}`,
                    participantId: address,
                    participantName: `${address.slice(0, 4)}…${address.slice(-4)}`,
                    probability: saved.probability,
                    submittedAt: saved.submittedAt,
                  },
                ],
              }
            : item,
        ),
      );
      setNotice(
        `Signed forecast locked at ${saved.probability}%. Receipt ${saved.commitmentHash.slice(0, 10)}… saved in ${saved.storage === "postgres" ? "Postgres" : "the local demo store"}.`,
      );
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not save the forecast.");
    }
  }

  function sealQuestion() {
    if (!canTransition(question.status, "sealed")) return;
    setQuestions((items) =>
      items.map((item) =>
        item.id === question.id ? { ...item, status: "sealed" as const } : item,
      ),
    );
    setNotice("Question sealed. Forecasts are now visible and cannot be changed.");
  }

  function resolveQuestion(outcome: BinaryOutcome) {
    if (!canTransition(question.status, "resolved")) return;
    setQuestions((items) =>
      items.map((item) =>
        item.id === question.id
          ? {
              ...item,
              status: "resolved" as const,
              outcome,
              sourceLabel: "Local demo resolution",
            }
          : item,
      ),
    );
    setNotice(
      `Resolved ${outcome === 1 ? "YES" : "NO"}. Scores and leaderboard were recalculated.`,
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Signal Room home">
          <SignalMark />
          <span>
            <strong>SIGNAL ROOM</strong>
            <small>Forecast what matters</small>
          </span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#room">Room</a>
          <a href="#leaderboard">Leaderboard</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <WalletButton />
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Live local prototype · no money at risk</p>
          <h1>Turn opinions into a<br /><em>track record.</em></h1>
          <p className="hero-description">
            Make an independent probability forecast. Keep it hidden until the
            deadline. Build a reputation from accuracy—not volume.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#room">Enter demo room <span>→</span></a>
            <a className="text-action" href="#how-it-works">See how scoring works</a>
          </div>
        </div>
        <div className="signal-preview" aria-label="Example forecast signal">
          <div className="preview-topline">
            <span>ROOM SIGNAL</span>
            <span className="private-label">HIDDEN WHILE OPEN</span>
          </div>
          <div className="preview-orbit">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="preview-number">68<small>%</small></div>
            <span className="orbit-node node-one" />
            <span className="orbit-node node-two" />
            <span className="orbit-node node-three" />
          </div>
          <div className="preview-footer">
            <span>Your private forecast</span>
            <strong>Signed receipt · live now</strong>
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Product principles">
        <div><strong>Independent</strong><span>Consensus stays hidden</span></div>
        <div><strong>Measurable</strong><span>Deterministic Brier score</span></div>
        <div><strong>Verifiable</strong><span>Wallet-signed receipts</span></div>
        <div><strong>Non-custodial</strong><span>No bets or deposits</span></div>
      </section>

      <section className="room-section" id="room">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> Interactive vertical slice</p>
            <h2>{DEMO_ROOM.name}</h2>
            <p>{DEMO_ROOM.description}</p>
          </div>
          <div className="room-facts">
            <span><strong>{DEMO_ROOM.members}</strong> members</span>
            <span><strong>{openCount}</strong> open</span>
            <span><strong>{resolvedCount}</strong> resolved</span>
          </div>
        </div>

        <div className="room-grid">
          <aside className="question-sidebar">
            <div className="sidebar-title">
              <span>Questions</span>
              <small>{questions.length} total</small>
            </div>
            <div className="question-list">
              {questions.map((item) => (
                <QuestionListItem
                  key={item.id}
                  question={item}
                  active={item.id === question.id}
                  onSelect={() => selectQuestion(item.id)}
                />
              ))}
            </div>
          </aside>

          <article className="forecast-card">
            <div className="question-meta">
              <span className={`status-pill ${question.status}`}>
                <i /> {statusCopy[question.status]}
              </span>
              <span>{question.category}</span>
              <span>Closes {question.closesAt}</span>
            </div>

            <h3>{question.prompt}</h3>
            <div className="criteria-box">
              <span>Resolution criteria</span>
              <p>{question.resolutionCriteria}</p>
            </div>

            {question.status === "open" ? (
              <div className="forecast-input">
                {ownForecast ? (
                  <div className="locked-forecast">
                    <span>Your forecast</span>
                    <strong>{ownForecast.probability}%</strong>
                    <p>Locked locally. Other forecasts remain hidden until seal.</p>
                  </div>
                ) : (
                  <>
                    <div className="probability-heading">
                      <div>
                        <span>Your probability</span>
                        <small>How likely is YES?</small>
                      </div>
                      <output htmlFor="probability">{probability}%</output>
                    </div>
                    <input
                      id="probability"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={probability}
                      onChange={(event) => setProbability(Number(event.target.value))}
                      style={{ "--forecast-value": `${probability}%` } as React.CSSProperties}
                    />
                    <div className="range-labels"><span>NO</span><span>UNCERTAIN</span><span>YES</span></div>
                    <button type="button" className="submit-button" onClick={() => void submitForecast()} disabled={busy}>
                      {busy
                        ? "Waiting for wallet…"
                        : address
                          ? `Sign & lock at ${probability}%`
                          : "Connect wallet to lock"} <span>→</span>
                    </button>
                    <p className="input-note">
                      {session
                        ? `Verified on devnet identity · ${session.storage === "postgres" ? "persistent database" : "in-memory demo storage"}`
                        : "Message signature only. No transaction and no SOL fee."}
                    </p>
                    {walletError && <p className="wallet-error">{walletError}</p>}
                  </>
                )}
              </div>
            ) : (
              <div className="revealed-panel">
                <div className="aggregate-block">
                  <span>Room aggregate</span>
                  <strong>{aggregate ?? 0}%</strong>
                  <small>{question.forecasts.length} revealed forecasts</small>
                </div>
                <div className="histogram" aria-label="Forecast distribution">
                  {histogram.map((count, index) => (
                    <div className="histogram-column" key={index}>
                      <span style={{ height: `${Math.max(8, (count / maxBucket) * 100)}%` }}>
                        <i>{count}</i>
                      </span>
                      <small>{index * 20}–{index === 4 ? 100 : index * 20 + 19}</small>
                    </div>
                  ))}
                </div>
                {question.status === "resolved" && question.outcome !== undefined && (
                  <div className="resolution-card">
                    <div>
                      <span>Final outcome</span>
                      <strong>{question.outcome === 1 ? "YES" : "NO"}</strong>
                    </div>
                    <div>
                      <span>Evidence</span>
                      <strong>{question.sourceLabel}</strong>
                    </div>
                    {ownForecast && (
                      <div>
                        <span>Your Brier score</span>
                        <strong>{formatScore(brierScorePoints(ownForecast.probability, question.outcome))}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {notice && <div className="notice" role="status"><span>✓</span>{notice}</div>}

            <div className="demo-controls">
              <div>
                <span>Organizer demo controls</span>
                <small>Local state controls for the demo; organizer roles come in the next slice.</small>
              </div>
              {question.status === "open" && (
                <button type="button" onClick={sealQuestion}>Seal question</button>
              )}
              {question.status === "sealed" && (
                <div className="resolve-actions">
                  <button type="button" onClick={() => resolveQuestion(0)}>Resolve NO</button>
                  <button type="button" onClick={() => resolveQuestion(1)}>Resolve YES</button>
                </div>
              )}
              {question.status === "resolved" && (
                <span className="finalized-label">Finalized locally</span>
              )}
            </div>
          </article>

          <aside className="leaderboard-card" id="leaderboard">
            <div className="sidebar-title">
              <span>Accuracy board</span>
              <small>Brier score</small>
            </div>
            <p className="leaderboard-intro">Accuracy compounds. Three resolved forecasts remove provisional status.</p>
            <div className="leaderboard-list">
              {leaderboard.slice(0, 5).map((entry, index) => (
                <div className={`leader-row ${entry.participantId === "you" ? "you" : ""}`} key={entry.participantId}>
                  <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                  <span className="leader-avatar">{entry.participantName.slice(0, 2).toUpperCase()}</span>
                  <div>
                    <strong>{entry.participantName}</strong>
                    <small>{entry.resolvedForecasts} resolved · {entry.directionAccuracy}% direction</small>
                  </div>
                  <span className="leader-score">{formatScore(entry.averageScore)}</span>
                </div>
              ))}
            </div>
            <div className="score-explainer">
              <span>Score guide</span>
              <p><strong>100</strong> perfect · <strong>75</strong> neutral 50% · <strong>0</strong> confidently wrong</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow"><span /> The loop</p>
            <h2>Simple enough to explain in 30 seconds.</h2>
          </div>
        </div>
        <div className="steps-grid">
          <article><span>01</span><h3>Forecast privately</h3><p>Choose a probability. The consensus stays hidden, so your signal remains independent.</p></article>
          <article><span>02</span><h3>Seal the room</h3><p>At the deadline, submissions stop and the distribution becomes visible to everyone.</p></article>
          <article><span>03</span><h3>Resolve with evidence</h3><p>An objective outcome and source close the question. The result cannot be reopened.</p></article>
          <article><span>04</span><h3>Earn a track record</h3><p>Brier scoring rewards calibrated confidence and exposes confidently wrong calls.</p></article>
        </div>
      </section>

      <footer>
        <a className="brand" href="#top"><SignalMark /><span><strong>SIGNAL ROOM</strong><small>Accuracy over volume</small></span></a>
        <p>Wallet-signed forecasts · Solana devnet identity · no funds at risk</p>
        <a href="https://github.com/hereismycodername/signal_room" target="_blank" rel="noreferrer">GitHub ↗</a>
      </footer>
    </main>
  );
}
