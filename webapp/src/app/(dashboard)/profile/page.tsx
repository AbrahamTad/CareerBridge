"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  Trash2,
  X,
  Sparkles,
  BookOpen,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { StarStory } from "@/app/api/ai/star-stories/route";
import { PageHero } from "@/components/ui/ModernShell";

export default function ProfilePage() {
  type ParsedCvData = Record<string, unknown>

  const [cv, setCv] = useState<{
    id: string;
    fileName?: string | null;
    rawText: string;
    createdAt: string;
    parsedData?: ParsedCvData | null;
  } | null>(null);
  const [profile, setProfile] = useState<{
    fullName?: string | null;
    phone?: string | null;
    city?: string | null;
    linkedinUrl?: string | null;
    githubUrl?: string | null;
    targetRoles?: string[];
    targetSalaryMin?: number | null;
    targetSalaryMax?: number | null;
    workPreference?: string[];
    jobTypes?: string[];
    liaEnabled?: boolean;
    liaDate1Start?: string | null;
    liaDate1End?: string | null;
    liaDate2Start?: string | null;
    liaDate2End?: string | null;
    skills?: string[];
    bio?: string | null;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [starStories, setStarStories] = useState<StarStory[] | null>(null);
  const [loadingStars, setLoadingStars] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cvRes, profileRes] = await Promise.all([
        fetch("/api/cv"),
        fetch("/api/profile"),
      ]);
      if (cvRes.ok) {
        const data = await cvRes.json();
        setCv(data.cv);
      }
      if (profileRes.ok) {
        const data = await profileRes.json();
        setProfile(data.profile ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleGenerateStarStories() {
    setLoadingStars(true);
    try {
      const res = await fetch("/api/ai/star-stories", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStarStories(data.stories);
      toast.success(`${data.stories.length} STAR-historier skapade`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunde inte generera stories");
    } finally {
      setLoadingStars(false);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    try {
      const analyzeRes = await fetch("/api/ai/analyze-cv", { method: "POST" });
      if (analyzeRes.ok) {
        toast.success("CV analyserat av AI");
      } else {
        const errData = await analyzeRes.json().catch(() => ({}));
        toast.error(errData.error ?? "AI-analys misslyckades");
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function inferMimeType(fileName: string) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "application/pdf";
    if (ext === "docx")
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === "doc") return "application/msword";
    if (ext === "txt") return "text/plain";
    return null;
  }

  async function handleFileUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Filen är för stor. Max 5 MB.");
      return;
    }
    const mimeType = file.type || inferMimeType(file.name);
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
    ];
    if (!mimeType || !allowed.includes(mimeType)) {
      toast.error("Filformat stöds inte. Använd PDF, DOCX, DOC eller TXT.");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/cv", { method: "POST", body: formData });
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = "Uppladdning misslyckades";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error ?? errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      toast.success("CV uppladdat!");
      await loadData();
      await runAnalysis();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Uppladdning misslyckades",
      );
    } finally {
      setUploading(false);
    }
  }

  async function handlePasteSubmit() {
    if (!pasteText.trim()) return;
    setUploading(true);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText.trim() }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = "Kunde inte spara CV";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error ?? errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      toast.success("CV sparat!");
      setShowPastePanel(false);
      setPasteText("");
      await loadData();
      await runAnalysis();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara CV");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteCV() {
    const res = await fetch("/api/cv", { method: "DELETE" });
    if (res.ok) {
      toast.success("CV borttaget");
      setCv(null);
      setShowDeleteConfirm(false);
    } else {
      toast.error("Fel vid borttagning");
    }
  }

  async function handleSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingProfile(true);
    const form = new FormData(e.currentTarget);
    const data = {
      fullName: form.get("fullName") as string,
      phone: form.get("phone") as string,
      city: form.get("city") as string,
      linkedinUrl: form.get("linkedinUrl") as string,
      githubUrl: form.get("githubUrl") as string,
      targetSalaryMin: parseInt(form.get("salaryMin") as string) || null,
      targetSalaryMax: parseInt(form.get("salaryMax") as string) || null,
      bio: form.get("bio") as string,
      liaEnabled: form.get("liaEnabled") === "on",
      liaDate1Start: (form.get("liaDate1Start") as string) || null,
      liaDate1End: (form.get("liaDate1End") as string) || null,
      liaDate2Start: (form.get("liaDate2Start") as string) || null,
      liaDate2End: (form.get("liaDate2End") as string) || null,
      targetRoles: (form.get("targetRoles") as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      skills: (form.get("skills") as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Profil sparad!");
      setProfile(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Fel");
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <PageHero
        eyebrow="CV understanding"
        title="Profile graph and CV intelligence"
        description="Keep your CV, skills, LIA dates, and preferences ready so AI search can reuse the latest analysis instead of starting over."
      />
      <div className="hidden">
        <h1 className="text-2xl font-bold text-slate-900">CV & Profil</h1>
        <p className="mt-1 text-slate-500">
          Hantera ditt CV och profilinformation
        </p>
      </div>

      {/* CV Section */}
      <div className="rounded-xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">
        {/* CV card exposes analysis state and keeps re-analysis one click away. */}
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Ditt CV</h2>

        {cv ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-900">
                    {cv.fileName ?? "CV inklistrat"}
                  </p>
                  <p className="text-xs text-green-600">
                    {cv.rawText.length.toLocaleString()} tecken extraherade
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runAnalysis()}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  {analyzing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Analysera igen
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-red-200 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Delete confirmation inline */}
            {showDeleteConfirm && (
              <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  Ta bort CV permanent?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleDeleteCV}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Ta bort
                  </button>
                </div>
              </div>
            )}

            {analyzing && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI analyserar ditt CV...
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Drag & drop zone */}
            {!showPastePanel && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileUpload(f);
                }}
                className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}
              >
                <Upload className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="mb-1 font-medium text-slate-600">
                  Dra och släpp ditt CV här
                </p>
                <p className="mb-5 text-sm text-slate-400">
                  PDF, DOCX eller TXT · Max 5 MB
                </p>
                <label className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
                  {uploading ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : (
                    "Välj fil"
                  )}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                  />
                </label>
              </div>
            )}

            {/* Toggle paste panel */}
            {!showPastePanel ? (
              <button
                onClick={() => setShowPastePanel(true)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                <FileText className="h-4 w-4" />
                Klistra in CV som text istället
              </button>
            ) : (
              /* Inline paste panel */
              <div className="rounded-xl border bg-slate-50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-semibold text-slate-800">
                      Klistra in ditt CV
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowPastePanel(false);
                      setPasteText("");
                    }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={10}
                  placeholder="Klistra in hela ditt CV här — inkludera erfarenhet, utbildning, kompetenser och kontaktinfo för bästa AI-resultat..."
                  className="w-full rounded-lg border bg-white px-4 py-3 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    {pasteText.length.toLocaleString()} tecken
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowPastePanel(false);
                        setPasteText("");
                      }}
                      className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Avbryt
                    </button>
                    <button
                      onClick={handlePasteSubmit}
                      disabled={uploading || pasteText.trim().length < 50}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {uploading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Spara & analysera
                    </button>
                  </div>
                </div>
              </div>
            )}

            {analyzing && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI analyserar ditt CV...
              </div>
            )}
          </div>
        )}
      </div>

      {/* CV Analysis Results */}
      {cv?.parsedData && <CvAnalysisCard parsedData={cv.parsedData as Record<string, unknown>} onReanalyze={runAnalysis} analyzing={analyzing} />}

      {/* Profile Form */}
      <div className="rounded-xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">
        {/* Profile fields feed the matching model with location, LIA, and skill context. */}
        <h2 className="mb-6 text-lg font-semibold text-slate-900">
          Profilinformation
        </h2>
        <form onSubmit={handleSaveProfile} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Namn
              </label>
              <input
                name="fullName"
                defaultValue={profile?.fullName ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Förnamn Efternamn"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Telefon
              </label>
              <input
                name="phone"
                defaultValue={profile?.phone ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="+46 70 000 00 00"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Stad
            </label>
            <input
              name="city"
              defaultValue={profile?.city ?? ""}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Göteborg"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                LinkedIn
              </label>
              <input
                name="linkedinUrl"
                defaultValue={profile?.linkedinUrl ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="linkedin.com/in/..."
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                GitHub
              </label>
              <input
                name="githubUrl"
                defaultValue={profile?.githubUrl ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="github.com/..."
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Önskade roller (kommaseparerade)
            </label>
            <input
              name="targetRoles"
              defaultValue={profile?.targetRoles?.join(", ") ?? ""}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Frontend Developer, QA Engineer"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Kompetenser (kommaseparerade)
            </label>
            <input
              name="skills"
              defaultValue={profile?.skills?.join(", ") ?? ""}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="React, TypeScript, Python"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Lägsta lön (SEK/mån)
              </label>
              <input
                name="salaryMin"
                type="number"
                defaultValue={profile?.targetSalaryMin ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="35000"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Högsta lön (SEK/mån)
              </label>
              <input
                name="salaryMax"
                type="number"
                defaultValue={profile?.targetSalaryMax ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="45000"
              />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="liaEnabled"
                type="checkbox"
                defaultChecked={profile?.liaEnabled ?? false}
                className="rounded"
              />
              <span className="text-sm font-medium text-slate-700">
                Jag söker LIA-plats
              </span>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">LIA 1 start</label>
              <input
                name="liaDate1Start"
                type="date"
                defaultValue={profile?.liaDate1Start?.slice(0, 10) ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">LIA 1 slut</label>
              <input
                name="liaDate1End"
                type="date"
                defaultValue={profile?.liaDate1End?.slice(0, 10) ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">LIA 2 start</label>
              <input
                name="liaDate2Start"
                type="date"
                defaultValue={profile?.liaDate2Start?.slice(0, 10) ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">LIA 2 slut</label>
              <input
                name="liaDate2End"
                type="date"
                defaultValue={profile?.liaDate2End?.slice(0, 10) ?? ""}
                className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Om dig (kort bio)
            </label>
            <textarea
              name="bio"
              rows={3}
              defaultValue={profile?.bio ?? ""}
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Berätta kort om dig själv och vad du söker..."
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {savingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
            Spara profil
          </button>
        </form>
      </div>

      {/* STAR story bank */}
      {cv && (
        <div className="rounded-xl border bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-violet-600" />
                Intervjustorybank
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                STAR-historier från ditt CV — redo att använda i intervjuer och personliga brev
              </p>
            </div>
            <button
              onClick={handleGenerateStarStories}
              disabled={loadingStars}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loadingStars ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {starStories ? "Generera om" : "Generera stories"}
            </button>
          </div>

          {starStories && starStories.length > 0 && (
            <div className="mt-5 space-y-3">
              {starStories.map((story, i) => (
                <StarStoryCard key={i} story={story} />
              ))}
            </div>
          )}

          {starStories && starStories.length === 0 && (
            <p className="mt-4 text-sm text-slate-400">
              Inga STAR-historier kunde extraheras. Försök ladda upp ett mer detaljerat CV.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function CvAnalysisCard({
  parsedData,
  onReanalyze,
  analyzing,
}: {
  parsedData: Record<string, unknown>;
  onReanalyze: () => void;
  analyzing: boolean;
}) {
  const skills = strArr(parsedData.skills).slice(0, 12);
  const tools = strArr(parsedData.tools).slice(0, 8);
  const targetRoles = strArr(parsedData.targetRoles).slice(0, 6);
  const sectors = strArr(parsedData.sectors).slice(0, 4);
  const seniority = typeof parsedData.seniorityLevel === 'string' ? parsedData.seniorityLevel : null;
  const isLia = parsedData.isLIAEligible === true;
  const source = typeof parsedData.source === 'string' ? parsedData.source : null;
  const hasRich = skills.length > 0 || targetRoles.length > 0;

  if (!hasRich) return null;

  const seniorityLabel: Record<string, string> = {
    junior: 'Junior', mid: 'Mid-level', senior: 'Senior', student: 'Student/LIA',
  };

  return (
    <div className="rounded-xl border border-white/70 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-600" />
            CV-analys
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {source === 'markitdown-service' ? 'Strukturerad Markdown-analys' : 'Lokal heuristisk analys'}
            {' · '}
            <button onClick={onReanalyze} disabled={analyzing} className="text-blue-600 hover:underline disabled:opacity-50">
              {analyzing ? 'Analyserar...' : 'Kör djupare AI-analys'}
            </button>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {seniority && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              {seniorityLabel[seniority] ?? seniority}
            </span>
          )}
          {isLia && (
            <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
              LIA-eligible
            </span>
          )}
          {sectors.map((s) => (
            <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 capitalize">
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {targetRoles.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Målroller</p>
            <div className="flex flex-wrap gap-1">
              {targetRoles.map((r) => (
                <span key={r} className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 border border-green-200">{r}</span>
              ))}
            </div>
          </div>
        )}
        {skills.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Kompetenser</p>
            <div className="flex flex-wrap gap-1">
              {skills.map((s) => (
                <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{s}</span>
              ))}
            </div>
          </div>
        )}
        {tools.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Verktyg & teknik</p>
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => (
                <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const STAR_LABELS: Record<keyof Pick<StarStory, 'situation' | 'task' | 'action' | 'result'>, string> = {
  situation: 'Situation',
  task: 'Uppgift',
  action: 'Åtgärd',
  result: 'Resultat',
};

function StarStoryCard({ story }: { story: StarStory }) {
  const [open, setOpen] = useState(false);

  const fullText = [
    `**${story.title}**`,
    `Situation: ${story.situation}`,
    `Uppgift: ${story.task}`,
    `Åtgärd: ${story.action}`,
    `Resultat: ${story.result}`,
  ].join('\n\n');

  async function copyStory() {
    await navigator.clipboard.writeText(fullText);
    toast.success('Story kopierad');
  }

  return (
    <div className="rounded-lg border bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900">{story.title}</p>
          {story.tags?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {story.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={copyStory} className="rounded p-1.5 text-slate-400 hover:text-violet-600" title="Kopiera">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setOpen((v) => !v)} className="rounded p-1.5 text-slate-400 hover:text-slate-700">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {(['situation', 'task', 'action', 'result'] as const).map((key) => (
            <div key={key} className="rounded-lg bg-white p-3 shadow-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {STAR_LABELS[key]}
              </p>
              <p className="text-slate-700 leading-snug">{story[key]}</p>
            </div>
          ))}
          {story.usefulFor?.length > 0 && (
            <div className="col-span-full rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700">
              <span className="font-semibold">Passar till: </span>
              {story.usefulFor.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
