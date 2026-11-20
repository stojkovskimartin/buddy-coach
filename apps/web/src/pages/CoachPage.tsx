import type { ChatReply } from "@buddy/api-client";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";

interface Turn {
  id: number;
  from: "you" | "coach";
  text: string;
  agent?: ChatReply["agent"];
  escalated?: boolean;
  failed?: boolean;
}

export function CoachPage() {
  const { api } = useSession();
  const { t } = useI18n();
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
      <h1>{t.coach.title}</h1>
      <div className="messages" aria-live="polite">
        {turns.length === 0 && (
          <div className="suggestions">
            {t.coach.suggestions.map((s) => (
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
            {turn.escalated && <span className="flag">{t.coach.important}</span>}
            {turn.failed && <span className="flag">{t.coach.unreachable}</span>}
            {turn.agent && !turn.escalated && (
              <span className="agent">{t.coach.agents[turn.agent]}</span>
            )}
            <p>{turn.text}</p>
          </div>
        ))}
        {busy && <p className="muted">{t.coach.thinking}</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="composer" aria-label={t.coach.form}>
        <input
          aria-label={t.coach.message}
          maxLength={2000}
          placeholder={t.coach.placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" disabled={busy || !message.trim()}>
          {t.coach.send}
        </button>
      </form>
      <p className="muted small">{t.coach.disclaimer}</p>
    </main>
  );
}
