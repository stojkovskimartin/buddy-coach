import type { ChatReply } from "@buddy/api-client";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { errorMessage, useSession } from "../lib/session";

interface Turn {
  id: number;
  from: "you" | "coach";
  text: string;
  agent?: ChatReply["agent"];
  escalated?: boolean;
  failed?: boolean;
}

const AGENT_LABELS: Record<ChatReply["agent"], string> = {
  head_coach: "Head Coach",
  nutrition: "Nutrition",
  training: "Training",
  recovery: "Recovery",
  progress: "Progress",
  motivation: "Motivation",
};

const SUGGESTIONS = [
  "How many calories should I eat today?",
  "What should I eat after a hard interval session?",
  "Should I take creatine?",
  "I slept badly – should I still train today?",
];

export function CoachPage() {
  const { api } = useSession();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [turns]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setTurns((t) => [...t, { id: nextId.current++, from: "you", text: trimmed }]);
    setMessage("");
    setBusy(true);
    try {
      const reply = await api.chat(trimmed);
      setTurns((t) => [
        ...t,
        {
          id: nextId.current++,
          from: "coach",
          text: reply.reply,
          agent: reply.agent,
          escalated: reply.escalated,
        },
      ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        { id: nextId.current++, from: "coach", text: errorMessage(e), failed: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(message);
  }

  return (
    <main className="card chat">
      <h1>Your coach</h1>
      <div className="messages" aria-live="polite">
        {turns.length === 0 && (
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`bubble ${turn.from}${turn.escalated ? " escalated" : ""}${turn.failed ? " failed" : ""}`}
            data-testid={`turn-${turn.from}`}
            {...(turn.escalated || turn.failed ? { role: "alert" } : {})}
          >
            {turn.escalated && <span className="flag">Important</span>}
            {turn.failed && <span className="flag">Could not reach your coach</span>}
            {turn.agent && !turn.escalated && (
              <span className="agent">{AGENT_LABELS[turn.agent]}</span>
            )}
            <p>{turn.text}</p>
          </div>
        ))}
        {busy && <p className="muted">Coach is thinking…</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="composer" aria-label="Message the coach">
        <input
          aria-label="Your message"
          maxLength={2000}
          placeholder="Ask about food, training or recovery…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" disabled={busy || !message.trim()}>
          Send
        </button>
      </form>
      <p className="muted small">Buddy Coach is not a doctor. For medical questions, see a professional.</p>
    </main>
  );
}
