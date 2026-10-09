"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSignalWallet } from "@/app/providers";
import { WalletButton } from "@/components/wallet-button";
import type { QuestionStatus } from "@/lib/forecasting";
import styles from "./studio.module.css";

type StudioQuestion = {
  id: string;
  roomId: string;
  prompt: string;
  category: string;
  resolutionCriteria: string;
  closesAt: string;
  status: QuestionStatus;
  outcome: number | null;
  evidenceLabel: string | null;
  evidenceUrl: string | null;
};

type StudioRoom = {
  id: string;
  name: string;
  description: string;
  questions: StudioQuestion[];
};

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: unknown;
  };
  if (!response.ok) throw new Error(body.error ?? "Request failed.");
  return body;
}

function defaultDeadline() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

function shortAddress(address: string) {
  return `${address.slice(0, 5)}…${address.slice(-5)}`;
}

export default function StudioPage() {
  const { address, session } = useSignalWallet();
  const [rooms, setRooms] = useState<StudioRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null,
    [rooms, selectedRoomId],
  );

  useEffect(() => {
    if (!address) return;
    let active = true;
    jsonRequest("/api/studio/rooms", { cache: "no-store" })
      .then((result) => {
        if (!active) return;
        const nextRooms = result.rooms as StudioRoom[];
        setRooms(nextRooms);
        setSelectedRoomId((current) => current ?? nextRooms[0]?.id ?? null);
      })
      .catch((cause) => {
        if (active) setNotice(cause instanceof Error ? cause.message : "Could not load studio.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [address]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setNotice(null);
    try {
      const result = await jsonRequest("/api/studio/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          description: data.get("description"),
        }),
      });
      const room = result.room as StudioRoom;
      setRooms((items) => [room, ...items]);
      setSelectedRoomId(room.id);
      form.reset();
      setNotice(`Room “${room.name}” created. Add its first forecasting question.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not create room.");
    } finally {
      setLoading(false);
    }
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setNotice(null);
    try {
      const result = await jsonRequest(
        `/api/studio/rooms/${selectedRoom.id}/questions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            prompt: data.get("prompt"),
            category: data.get("category"),
            resolutionCriteria: data.get("resolutionCriteria"),
            closesAt: new Date(String(data.get("closesAt"))).toISOString(),
          }),
        },
      );
      const question = result.question as StudioQuestion;
      setRooms((items) =>
        items.map((room) =>
          room.id === selectedRoom.id
            ? { ...room, questions: [...room.questions, question] }
            : room,
        ),
      );
      form.reset();
      const deadlineInput = form.elements.namedItem("closesAt") as HTMLInputElement | null;
      if (deadlineInput) deadlineInput.value = defaultDeadline();
      setNotice("Draft created. Review the wording, then open it for forecasts.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not create question.");
    } finally {
      setLoading(false);
    }
  }

  async function transitionQuestion(
    questionId: string,
    body: Record<string, unknown>,
  ) {
    setLoading(true);
    setNotice(null);
    try {
      const result = await jsonRequest(
        `/api/studio/questions/${questionId}/transition`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const updated = result.question as StudioQuestion;
      setRooms((items) =>
        items.map((room) => ({
          ...room,
          questions: room.questions.map((question) =>
            question.id === updated.id ? updated : question,
          ),
        })),
      );
      setNotice(`Question moved to ${updated.status.toUpperCase()}.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not update question.");
    } finally {
      setLoading(false);
    }
  }

  async function resolveQuestion(
    event: FormEvent<HTMLFormElement>,
    questionId: string,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await transitionQuestion(questionId, {
      action: "resolve",
      outcome: Number(data.get("outcome")),
      evidenceLabel: data.get("evidenceLabel"),
      evidenceUrl: data.get("evidenceUrl"),
    });
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span>SR</span>
          <strong>SIGNAL ROOM</strong>
          <small>Organizer Studio</small>
        </Link>
        <nav>
          <Link href="/">Public demo</Link>
          <a href="#rooms">Rooms</a>
          <a href="#questions">Questions</a>
        </nav>
        <WalletButton />
      </header>

      <section className={styles.hero}>
        <p>ORGANIZER WORKSPACE · WALLET-PERMISSIONED</p>
        <h1>Publish clear questions.<br /><em>Protect the signal.</em></h1>
        <div>
          <span>01 Draft precisely</span>
          <span>02 Open forecasts</span>
          <span>03 Seal distribution</span>
          <span>04 Resolve with evidence</span>
        </div>
      </section>

      {!address ? (
        <section className={styles.connectCard}>
          <span>Wallet required</span>
          <h2>Your wallet becomes the room authority.</h2>
          <p>
            Connect and sign the free login message. Only this verified address
            can open, seal, or resolve its questions.
          </p>
          <WalletButton />
        </section>
      ) : (
        <section className={styles.workspace}>
          <aside className={styles.sidebar} id="rooms">
            <div className={styles.authority}>
              <span>Organizer authority</span>
              <strong>{shortAddress(address)}</strong>
              <small>{session?.storage === "postgres" ? "PostgreSQL" : "Demo memory"}</small>
            </div>

            <div className={styles.roomList}>
              <div className={styles.panelTitle}><span>Your rooms</span><b>{rooms.length}</b></div>
              {rooms.map((room) => (
                <button
                  type="button"
                  key={room.id}
                  className={room.id === selectedRoom?.id ? styles.activeRoom : ""}
                  onClick={() => setSelectedRoomId(room.id)}
                >
                  <strong>{room.name}</strong>
                  <small>{room.questions.length} questions</small>
                </button>
              ))}
              {rooms.length === 0 && <p>No rooms yet. Create the first one below.</p>}
            </div>

            <form className={styles.compactForm} onSubmit={createRoom}>
              <h3>Create room</h3>
              <label>Name<input name="name" minLength={3} maxLength={80} required placeholder="Research Council" /></label>
              <label>Description<textarea name="description" minLength={12} maxLength={500} required placeholder="What this community forecasts and why." /></label>
              <button disabled={loading}>Create private draft space <span>→</span></button>
            </form>
          </aside>

          <div className={styles.mainPanel} id="questions">
            {selectedRoom ? (
              <>
                <div className={styles.roomHeading}>
                  <div><span>Selected room</span><h2>{selectedRoom.name}</h2><p>{selectedRoom.description}</p></div>
                  <Link href={`/rooms/${selectedRoom.id}`}>Open public room ↗</Link>
                </div>

                <form className={styles.questionForm} onSubmit={createQuestion}>
                  <div className={styles.formHeading}><span>New binary question</span><small>Saved as DRAFT first</small></div>
                  <label className={styles.wide}>Question<input name="prompt" minLength={12} maxLength={240} required placeholder="Will the public launch happen before…?" /></label>
                  <label>Category<input name="category" minLength={2} maxLength={50} required placeholder="Product" /></label>
                  <label>Forecast deadline<input name="closesAt" type="datetime-local" defaultValue={defaultDeadline()} required /></label>
                  <label className={styles.wide}>Objective resolution criteria<textarea name="resolutionCriteria" minLength={20} maxLength={800} required placeholder="Resolves YES only if an official source publishes…" /></label>
                  <button disabled={loading}>Save question draft <span>→</span></button>
                </form>

                <div className={styles.questionStack}>
                  {selectedRoom.questions.map((question, index) => (
                    <article className={styles.questionCard} key={question.id}>
                      <div className={styles.questionTopline}>
                        <span>{String(index + 1).padStart(2, "0")} · {question.category}</span>
                        <b data-status={question.status}>{question.status}</b>
                      </div>
                      <h3>{question.prompt}</h3>
                      <p>{question.resolutionCriteria}</p>
                      <small>Closes {new Date(question.closesAt).toLocaleString()}</small>

                      <div className={styles.lifecycle}>
                        {question.status === "draft" && (
                          <button disabled={loading} onClick={() => void transitionQuestion(question.id, { action: "open" })}>Open forecasts</button>
                        )}
                        {question.status === "open" && (
                          <button disabled={loading} onClick={() => void transitionQuestion(question.id, { action: "seal" })}>Seal now</button>
                        )}
                        {question.status === "sealed" && (
                          <form onSubmit={(event) => void resolveQuestion(event, question.id)}>
                            <select name="outcome" aria-label="Final outcome"><option value="1">YES</option><option value="0">NO</option></select>
                            <input name="evidenceLabel" required minLength={3} maxLength={120} placeholder="Official announcement" />
                            <input name="evidenceUrl" type="url" required placeholder="https://source.example" />
                            <button disabled={loading}>Resolve forever</button>
                          </form>
                        )}
                        {question.status === "resolved" && (
                          <div className={styles.resolved}>
                            <strong>{question.outcome === 1 ? "YES" : "NO"}</strong>
                            <a href={question.evidenceUrl ?? "#"} target="_blank" rel="noreferrer">{question.evidenceLabel} ↗</a>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                  {selectedRoom.questions.length === 0 && (
                    <div className={styles.emptyState}>No questions yet. The first one should be narrow, objective, and easy to resolve.</div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.emptyHero}><span>Start here</span><h2>Create a room for your forecasting community.</h2></div>
            )}
          </div>
        </section>
      )}

      {notice && <div className={styles.toast} role="status">{notice}</div>}
    </main>
  );
}
