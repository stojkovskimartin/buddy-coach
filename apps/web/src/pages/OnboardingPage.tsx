import type { ProfileIn } from "@buddy/api-client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { maxBirthYear } from "../lib/rules";
import { errorMessage, useSession } from "../lib/session";

/** Form state keeps text, so body data starts empty instead of with made-up numbers. */
interface FormState {
  birth_year: string;
  sex: "" | ProfileIn["sex"];
  height_cm: string;
  weight_kg: string;
  experience: ProfileIn["experience"];
  coach_style: NonNullable<ProfileIn["coach_style"]>;
  available_days_per_week: string;
  minutes_per_session: string;
}

function toForm(profile: ProfileIn | null | undefined): FormState {
  return {
    birth_year: profile ? String(profile.birth_year) : "",
    sex: profile?.sex ?? "",
    height_cm: profile ? String(profile.height_cm) : "",
    weight_kg: profile ? String(profile.weight_kg) : "",
    experience: profile?.experience ?? "beginner",
    coach_style: profile?.coach_style ?? "friendly",
    available_days_per_week: profile ? String(profile.available_days_per_week) : "3",
    minutes_per_session: profile ? String(profile.minutes_per_session) : "45",
  };
}

function toProfile(form: FormState, previous: ProfileIn | null | undefined): ProfileIn {
  return {
    birth_year: Number(form.birth_year),
    sex: form.sex as ProfileIn["sex"],
    height_cm: Number(form.height_cm),
    weight_kg: Number(form.weight_kg),
    experience: form.experience,
    coach_style: form.coach_style,
    available_days_per_week: Number(form.available_days_per_week),
    minutes_per_session: Number(form.minutes_per_session),
    timezone:
      previous?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich"),
    locale: previous?.locale ?? (navigator.language.toLowerCase().startsWith("de") ? "de" : "en"),
  };
}

/** Body data and availability: everything the engines need for the first targets. */
export function OnboardingPage({ initial, children }: { initial?: ProfileIn | null; children?: ReactNode }) {
  const { api } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.saveProfile(toProfile(form, initial));
      navigate("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="stack">
      <header className="page-header">
        <div>
          <h1>{initial ? "Your profile" : "About you"}</h1>
          <p className="muted">Your coach uses this to calculate your targets. You can change it later.</p>
        </div>
      </header>
      <section className="card">
        <form onSubmit={submit} aria-label="Profile" className="profile-form">
          <fieldset className="grid">
            <legend>Body</legend>
            <label>
              Birth year
              <input
                type="number"
                min={1920}
                max={maxBirthYear()}
                required
                value={form.birth_year}
                onChange={(e) => set("birth_year", e.target.value)}
              />
            </label>
            <label>
              Sex
              <select
                required
                value={form.sex}
                onChange={(e) => set("sex", e.target.value as FormState["sex"])}
              >
                <option value="" disabled>
                  Choose…
                </option>
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
                onChange={(e) => set("height_cm", e.target.value)}
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
                onChange={(e) => set("weight_kg", e.target.value)}
              />
            </label>
          </fieldset>
          <fieldset className="grid">
            <legend>Training</legend>
            <label>
              Experience
              <select
                value={form.experience}
                onChange={(e) => set("experience", e.target.value as FormState["experience"])}
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
                value={form.coach_style}
                onChange={(e) => set("coach_style", e.target.value as FormState["coach_style"])}
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
                onChange={(e) => set("available_days_per_week", e.target.value)}
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
                onChange={(e) => set("minutes_per_session", e.target.value)}
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy}>
            {initial ? "Save" : "Save and continue"}
          </button>
        </form>
      </section>
      {children}
    </main>
  );
}
