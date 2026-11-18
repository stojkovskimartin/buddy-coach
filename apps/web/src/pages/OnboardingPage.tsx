import type { ProfileIn } from "@buddy/api-client";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { errorMessage, useSession } from "../lib/session";

const DEFAULTS: ProfileIn = {
  birth_year: 1995,
  sex: "male",
  height_cm: 175,
  weight_kg: 70,
  experience: "beginner",
  coach_style: "friendly",
  available_days_per_week: 4,
  minutes_per_session: 45,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich",
  locale: navigator.language.startsWith("de") ? "de" : "en",
};

/** Body data and availability: everything the engines need for the first targets. */
export function OnboardingPage({ initial }: { initial?: ProfileIn | null }) {
  const { api } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState<ProfileIn>(initial ?? DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ProfileIn>(key: K, value: ProfileIn[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.saveProfile(form);
      navigate("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>About you</h1>
      <p className="muted">Your coach uses this to calculate your targets. You can change it later.</p>
      <form onSubmit={submit} aria-label="Profile" className="grid">
        <label>
          Birth year
          <input
            type="number"
            min={1920}
            max={new Date().getFullYear() - 18}
            required
            value={form.birth_year}
            onChange={(e) => set("birth_year", Number(e.target.value))}
          />
        </label>
        <label>
          Sex
          <select value={form.sex} onChange={(e) => set("sex", e.target.value as ProfileIn["sex"])}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label>
          Height (cm)
          <input
            type="number"
            min={100}
            max={250}
            required
            value={form.height_cm}
            onChange={(e) => set("height_cm", Number(e.target.value))}
          />
        </label>
        <label>
          Weight (kg)
          <input
            type="number"
            min={30}
            max={300}
            step={0.1}
            required
            value={form.weight_kg}
            onChange={(e) => set("weight_kg", Number(e.target.value))}
          />
        </label>
        <label>
          Experience
          <select
            value={form.experience}
            onChange={(e) => set("experience", e.target.value as ProfileIn["experience"])}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="elite">Elite</option>
          </select>
        </label>
        <label>
          Coach style
          <select
            value={form.coach_style ?? "friendly"}
            onChange={(e) => set("coach_style", e.target.value as ProfileIn["coach_style"])}
          >
            <option value="friendly">Friendly</option>
            <option value="strict">Strict</option>
            <option value="data_driven">Data-driven</option>
          </select>
        </label>
        <label>
          Training days per week
          <input
            type="number"
            min={1}
            max={7}
            required
            value={form.available_days_per_week}
            onChange={(e) => set("available_days_per_week", Number(e.target.value))}
          />
        </label>
        <label>
          Minutes per session
          <input
            type="number"
            min={10}
            max={600}
            required
            value={form.minutes_per_session}
            onChange={(e) => set("minutes_per_session", Number(e.target.value))}
          />
        </label>
        {error && (
          <p role="alert" className="error span">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="span">
          Save and continue
        </button>
      </form>
    </main>
  );
}
