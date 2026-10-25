import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { get, send } from "../lib/api";
import { Field, FormStatus, SelectField } from "./field";
import { Loading, Panel } from "./ui";
import type { Portfolio } from "../lib/types";

/**
 * The student's portfolio: who they are beyond a CGPA.
 *
 * Saved as one document rather than per-section, because the sections are
 * edited together and a dozen endpoints would multiply the ownership checks
 * without making anything safer.
 *
 * Nothing here feeds an eligibility verdict. It is context — for the student's
 * own record, and for the recommendations built on top of it.
 */

const EMPTY: Portfolio = {
  phone: null,
  city: null,
  summary: "",
  portfolioUrl: null,
  linkedinUrl: null,
  githubUrl: null,
  education: [],
  experience: [],
  projects: [],
  certificates: [],
  codingProfiles: [],
};

type Section = "personal" | "education" | "work" | "certificates" | "coding";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "education", label: "Education" },
  { value: "work", label: "Experience" },
  { value: "certificates", label: "Certificates" },
  { value: "coding", label: "Coding profiles" },
];

const SCORE_TYPES = [
  { value: "", label: "No score" },
  { value: "percentage", label: "Percentage" },
  { value: "cgpa", label: "CGPA (out of 10)" },
  { value: "grade", label: "Letter grade" },
];

const WORK_KINDS = [
  { value: "internship", label: "Internship" },
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "freelance", label: "Freelance" },
  { value: "volunteer", label: "Volunteer" },
];

const PLATFORMS = [
  { value: "github", label: "GitHub" },
  { value: "leetcode", label: "LeetCode" },
  { value: "codeforces", label: "Codeforces" },
  { value: "hackerrank", label: "HackerRank" },
  { value: "codechef", label: "CodeChef" },
  { value: "other", label: "Other" },
];

/** A row in a repeating section, with its own delete control. */
function Row({
  title,
  onRemove,
  children,
}: {
  title: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-flush min-w-0 space-y-3 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wide text-faint">{title}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove this ${title.toLowerCase()}`}
          className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-bad/10 hover:text-bad"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {children}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Comma-separated text to a list and back, for the technology fields. */
const toList = (text: string) =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

export function PortfolioEditor() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [section, setSection] = useState<Section>("personal");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, failure: f } = await get<{ portfolio: Portfolio }>("/api/portfolio");
    if (f || !data) {
      setFailure(f?.message ?? "Your portfolio could not be loaded.");
      return;
    }
    setPortfolio({ ...EMPTY, ...data.portfolio });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!portfolio || busy) return;
    setBusy(true);
    setSaved(null);
    setFields({});

    const { data, failure: f } = await send<{ portfolio: Portfolio }>(
      "/api/portfolio",
      "PUT",
      portfolio,
    );
    setBusy(false);

    if (f || !data) {
      setFailure(f?.message ?? "Your portfolio could not be saved.");
      setFields(f?.fields ?? {});
      return;
    }
    setFailure(null);
    setPortfolio({ ...EMPTY, ...data.portfolio });
    setSaved("Saved.");
  }

  if (!portfolio) return <Loading label="Loading your portfolio" rows={2} />;

  /** Patch one entry in one array section. */
  const patch = <K extends keyof Portfolio>(
    key: K,
    index: number,
    changes: Record<string, unknown>,
  ) => {
    const list = [...(portfolio[key] as unknown as Record<string, unknown>[])];
    list[index] = { ...list[index], ...changes };
    setPortfolio({ ...portfolio, [key]: list } as Portfolio);
  };

  const removeAt = <K extends keyof Portfolio>(key: K, index: number) => {
    const list = [...(portfolio[key] as unknown as unknown[])];
    list.splice(index, 1);
    setPortfolio({ ...portfolio, [key]: list } as Portfolio);
  };

  const appendTo = <K extends keyof Portfolio>(key: K, entry: unknown) => {
    const list = [...(portfolio[key] as unknown as unknown[]), entry];
    setPortfolio({ ...portfolio, [key]: list } as Portfolio);
  };

  return (
    <Panel
      title="Your portfolio"
      subtitle="Education, work, projects and links — none of this affects eligibility"
    >
      {/* Sections rather than one long form, so a student adding a
          certificate is not scrolling past their whole history to do it. */}
      <div
        role="tablist"
        aria-label="Portfolio sections"
        className="mb-4 flex gap-0.5 overflow-x-auto rounded-lg border border-edge bg-canvas p-0.5"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={section === s.value}
            onClick={() => setSection(s.value)}
            className={`shrink-0 rounded-[0.4rem] px-3 py-1.5 text-sm font-medium transition-colors ${
              section === s.value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {section === "personal" && (
          <>
            <Field
              label="Professional summary"
              name="summary"
              value={portfolio.summary}
              onChange={(v) => setPortfolio({ ...portfolio, summary: v })}
              error={fields.summary}
              placeholder="Two lines on what you build and what you are looking for"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phone"
                name="phone"
                value={portfolio.phone ?? ""}
                onChange={(v) => setPortfolio({ ...portfolio, phone: v })}
                error={fields.phone}
                hint="Private to you"
              />
              <Field
                label="City"
                name="city"
                value={portfolio.city ?? ""}
                onChange={(v) => setPortfolio({ ...portfolio, city: v })}
                error={fields.city}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="GitHub"
                name="githubUrl"
                type="url"
                value={portfolio.githubUrl ?? ""}
                onChange={(v) => setPortfolio({ ...portfolio, githubUrl: v })}
                error={fields.githubUrl}
                placeholder="https://"
              />
              <Field
                label="LinkedIn"
                name="linkedinUrl"
                type="url"
                value={portfolio.linkedinUrl ?? ""}
                onChange={(v) => setPortfolio({ ...portfolio, linkedinUrl: v })}
                error={fields.linkedinUrl}
                placeholder="https://"
              />
              <Field
                label="Portfolio site"
                name="portfolioUrl"
                type="url"
                value={portfolio.portfolioUrl ?? ""}
                onChange={(v) => setPortfolio({ ...portfolio, portfolioUrl: v })}
                error={fields.portfolioUrl}
                placeholder="https://"
              />
            </div>
          </>
        )}

        {section === "education" && (
          <>
            {portfolio.education.map((entry, i) => (
              <Row key={i} title="Education" onRemove={() => removeAt("education", i)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Institution"
                    name={`edu-${i}-institution`}
                    value={entry.institution}
                    onChange={(v) => patch("education", i, { institution: v })}
                    error={fields[`education.${i}.institution`]}
                    required
                  />
                  <Field
                    label="Qualification"
                    name={`edu-${i}-qualification`}
                    value={entry.qualification}
                    onChange={(v) => patch("education", i, { qualification: v })}
                    error={fields[`education.${i}.qualification`]}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label="Period"
                    name={`edu-${i}-period`}
                    value={entry.period ?? ""}
                    onChange={(v) => patch("education", i, { period: v })}
                    placeholder="2023 – 2027"
                  />
                  <SelectField
                    label="Score type"
                    name={`edu-${i}-scoreType`}
                    value={entry.scoreType ?? ""}
                    options={SCORE_TYPES}
                    onChange={(v) => patch("education", i, { scoreType: v || null })}
                  />
                  {entry.scoreType === "grade" ? (
                    <Field
                      label="Grade"
                      name={`edu-${i}-scoreText`}
                      value={entry.scoreText ?? ""}
                      onChange={(v) => patch("education", i, { scoreText: v })}
                      error={fields[`education.${i}.scoreText`]}
                    />
                  ) : (
                    <Field
                      label={entry.scoreType === "cgpa" ? "CGPA" : "Percentage"}
                      name={`edu-${i}-scoreValue`}
                      type="number"
                      step="0.01"
                      min={0}
                      max={entry.scoreType === "cgpa" ? 10 : 100}
                      value={entry.scoreValue === null ? "" : String(entry.scoreValue)}
                      onChange={(v) => patch("education", i, { scoreValue: v === "" ? null : v })}
                      error={fields[`education.${i}.scoreValue`]}
                      hint={entry.scoreType === "cgpa" ? "Out of 10" : undefined}
                    />
                  )}
                </div>
              </Row>
            ))}
            <AddButton
              label="Add education"
              onClick={() =>
                appendTo("education", {
                  institution: "",
                  qualification: "",
                  period: null,
                  scoreType: null,
                  scoreValue: null,
                  scoreText: null,
                  notes: "",
                })
              }
            />
          </>
        )}

        {section === "work" && (
          <>
            {portfolio.experience.map((entry, i) => (
              <Row key={`x${i}`} title="Experience" onRemove={() => removeAt("experience", i)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Organisation"
                    name={`exp-${i}-org`}
                    value={entry.organisation}
                    onChange={(v) => patch("experience", i, { organisation: v })}
                    error={fields[`experience.${i}.organisation`]}
                    required
                  />
                  <Field
                    label="Role"
                    name={`exp-${i}-role`}
                    value={entry.role}
                    onChange={(v) => patch("experience", i, { role: v })}
                    error={fields[`experience.${i}.role`]}
                    required
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <SelectField
                    label="Type"
                    name={`exp-${i}-kind`}
                    value={entry.kind}
                    options={WORK_KINDS}
                    onChange={(v) => patch("experience", i, { kind: v })}
                  />
                  <Field
                    label="From"
                    name={`exp-${i}-start`}
                    type="month"
                    value={entry.startDate ?? ""}
                    onChange={(v) => patch("experience", i, { startDate: v })}
                    error={fields[`experience.${i}.startDate`]}
                  />
                  <Field
                    label="To"
                    name={`exp-${i}-end`}
                    type="month"
                    value={entry.endDate ?? ""}
                    onChange={(v) => patch("experience", i, { endDate: v, current: false })}
                    error={fields[`experience.${i}.endDate`]}
                    hint={entry.current ? "Ongoing" : undefined}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={entry.current}
                    onChange={(e) =>
                      patch("experience", i, {
                        current: e.target.checked,
                        endDate: e.target.checked ? null : entry.endDate,
                      })
                    }
                    className="h-3.5 w-3.5 rounded border-edge accent-accent"
                  />
                  Still working here
                </label>
                <Field
                  label="Technologies"
                  name={`exp-${i}-tech`}
                  value={entry.technologies.join(", ")}
                  onChange={(v) => patch("experience", i, { technologies: toList(v) })}
                  hint="Comma separated"
                />
              </Row>
            ))}
            <AddButton
              label="Add experience"
              onClick={() =>
                appendTo("experience", {
                  organisation: "",
                  role: "",
                  kind: "internship",
                  startDate: null,
                  endDate: null,
                  current: false,
                  description: "",
                  technologies: [],
                })
              }
            />

            <div className="border-t border-edge pt-4">
              {portfolio.projects.map((entry, i) => (
                <div key={`p${i}`} className="mb-3">
                  <Row title="Project" onRemove={() => removeAt("projects", i)}>
                    <Field
                      label="Name"
                      name={`proj-${i}-name`}
                      value={entry.name}
                      onChange={(v) => patch("projects", i, { name: v })}
                      error={fields[`projects.${i}.name`]}
                      required
                    />
                    <Field
                      label="Description"
                      name={`proj-${i}-desc`}
                      value={entry.description}
                      onChange={(v) => patch("projects", i, { description: v })}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Repository"
                        name={`proj-${i}-repo`}
                        type="url"
                        value={entry.repoUrl ?? ""}
                        onChange={(v) => patch("projects", i, { repoUrl: v })}
                        error={fields[`projects.${i}.repoUrl`]}
                        placeholder="https://"
                      />
                      <Field
                        label="Live demo"
                        name={`proj-${i}-live`}
                        type="url"
                        value={entry.liveUrl ?? ""}
                        onChange={(v) => patch("projects", i, { liveUrl: v })}
                        error={fields[`projects.${i}.liveUrl`]}
                        placeholder="https://"
                      />
                    </div>
                    <Field
                      label="Technologies"
                      name={`proj-${i}-tech`}
                      value={entry.technologies.join(", ")}
                      onChange={(v) => patch("projects", i, { technologies: toList(v) })}
                      hint="Comma separated"
                    />
                  </Row>
                </div>
              ))}
              <AddButton
                label="Add project"
                onClick={() =>
                  appendTo("projects", {
                    name: "",
                    description: "",
                    repoUrl: null,
                    liveUrl: null,
                    technologies: [],
                  })
                }
              />
            </div>
          </>
        )}

        {section === "certificates" && (
          <>
            {portfolio.certificates.map((entry, i) => (
              <Row key={`c${i}`} title="Certificate" onRemove={() => removeAt("certificates", i)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Title"
                    name={`cert-${i}-title`}
                    value={entry.title}
                    onChange={(v) => patch("certificates", i, { title: v })}
                    error={fields[`certificates.${i}.title`]}
                    required
                  />
                  <Field
                    label="Issued by"
                    name={`cert-${i}-issuer`}
                    value={entry.issuer ?? ""}
                    onChange={(v) => patch("certificates", i, { issuer: v })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label="Issued"
                    name={`cert-${i}-issued`}
                    type="month"
                    value={entry.issuedOn ?? ""}
                    onChange={(v) => patch("certificates", i, { issuedOn: v })}
                  />
                  <Field
                    label="Expires"
                    name={`cert-${i}-expires`}
                    type="month"
                    value={entry.expiresOn ?? ""}
                    onChange={(v) => patch("certificates", i, { expiresOn: v })}
                    error={fields[`certificates.${i}.expiresOn`]}
                  />
                  <Field
                    label="Credential ID"
                    name={`cert-${i}-cred`}
                    value={entry.credentialId ?? ""}
                    onChange={(v) => patch("certificates", i, { credentialId: v })}
                  />
                </div>
                <Field
                  label="Verification link"
                  name={`cert-${i}-url`}
                  type="url"
                  value={entry.verificationUrl ?? ""}
                  onChange={(v) => patch("certificates", i, { verificationUrl: v })}
                  error={fields[`certificates.${i}.verificationUrl`]}
                  placeholder="https://"
                  hint="Where someone can check it"
                />
              </Row>
            ))}
            <AddButton
              label="Add certificate"
              onClick={() =>
                appendTo("certificates", {
                  title: "",
                  issuer: null,
                  issuedOn: null,
                  expiresOn: null,
                  credentialId: null,
                  verificationUrl: null,
                })
              }
            />
            <p className="text-2xs leading-relaxed text-faint">
              RoundReady does not verify certificates. Adding one records that you say you hold it,
              which is not the same as it having been checked.
            </p>
          </>
        )}

        {section === "coding" && (
          <>
            {portfolio.codingProfiles.map((entry, i) => (
              <Row key={`g${i}`} title="Profile" onRemove={() => removeAt("codingProfiles", i)}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Platform"
                    name={`cp-${i}-platform`}
                    value={entry.platform}
                    options={PLATFORMS}
                    onChange={(v) => patch("codingProfiles", i, { platform: v })}
                  />
                  {entry.platform === "other" ? (
                    <Field
                      label="Platform name"
                      name={`cp-${i}-name`}
                      value={entry.platformName ?? ""}
                      onChange={(v) => patch("codingProfiles", i, { platformName: v })}
                      error={fields[`codingProfiles.${i}.platformName`]}
                      required
                    />
                  ) : (
                    <Field
                      label="Username"
                      name={`cp-${i}-user`}
                      value={entry.username ?? ""}
                      onChange={(v) => patch("codingProfiles", i, { username: v })}
                    />
                  )}
                </div>
                <Field
                  label="Profile link"
                  name={`cp-${i}-url`}
                  type="url"
                  value={entry.profileUrl}
                  onChange={(v) => patch("codingProfiles", i, { profileUrl: v })}
                  error={fields[`codingProfiles.${i}.profileUrl`]}
                  placeholder="https://"
                  required
                />
              </Row>
            ))}
            <AddButton
              label="Add coding profile"
              onClick={() =>
                appendTo("codingProfiles", {
                  platform: "github",
                  platformName: null,
                  username: null,
                  profileUrl: "",
                  preferred: false,
                  notes: "",
                })
              }
            />
            <p className="text-2xs leading-relaxed text-faint">
              These are links, not evidence. RoundReady has no integration with any of these
              platforms, so it shows no problem counts or ratings — a number here would be one
              nobody fetched.
            </p>
          </>
        )}
      </div>

      <FormStatus error={failure} success={saved} />

      <div className="mt-4 flex items-center gap-3 border-t border-edge pt-4">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          Save portfolio
        </button>
        <p className="text-xs text-muted">Private to you.</p>
      </div>
    </Panel>
  );
}
