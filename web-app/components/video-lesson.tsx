"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ExternalLink, FileQuestion,
  Lightbulb, Link2, Loader2, MessageCircle, Play, Reply, Send, Sparkles, ThumbsUp,
} from "lucide-react";
import ChatPanel from "@/components/chat-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import type { CourseManifest, ModuleManifest } from "@/lib/project-catalog";
import { cn } from "@/lib/utils";

type QuizQuestion = { id: string; prompt: string; options: string[] };
type QuizReview = { id: string; selectedIndex: number; correctIndex: number; correct: boolean; explanation: string };
type QuizData = { questions: QuizQuestion[]; attempt: null | { attemptCount: number; bestScore: number; lastScore: number; review: QuizReview[] }; maxAttempts: number };
type Post = { id: string; body: string; kind: "question" | "insight"; parentId: string | null; author: string; upvoteCount: number; viewerUpvoted: boolean; createdAt: string };
type Resource = { id: string; url: string; title: string; description: string | null; domain: string; type: string; verified: boolean; upvoteCount: number; viewerUpvoted: boolean };
type Tab = "quiz" | "discussion" | "resources";

const lessonHref = (courseSlug: string, moduleSlug: string) => `/projects/${courseSlug}/lessons/${moduleSlug}`;
const lessonKey = (courseSlug: string, moduleSlug: string) => `lesson:${courseSlug}:${moduleSlug}`;

function relativeTime(value: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function QuizSection({ courseSlug, moduleSlug }: { courseSlug: string; moduleSlug: string }) {
  const endpoint = `/api/lessons/${courseSlug}/${moduleSlug}/quiz`;
  const [data, setData] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [review, setReview] = useState<QuizReview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { fetch(endpoint).then((r) => r.json()).then((value) => { setData(value); setReview(value.attempt?.review ?? null); }).catch(() => setError("Could not load the quiz.")); }, [endpoint]);
  if (!data) return <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">{error || <Loader2 className="h-5 w-5 animate-spin" />}</div>;
  const attemptCount = data.attempt?.attemptCount ?? 0;
  const submitted = review !== null;
  async function submit() {
    if (Object.keys(answers).length !== data!.questions.length) { setError("Choose an answer for every question."); return; }
    setBusy(true); setError("");
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: data!.questions.map((q) => answers[q.id]) }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setError(response.status === 401 ? "Sign in to save and submit your quiz." : result.error === "attempt_limit" ? "You have used all three attempts." : result.error); return; }
    setReview(result.review); setData((current) => current && ({ ...current, attempt: { attemptCount: result.attemptCount, bestScore: result.bestScore, lastScore: result.score, review: result.review } }));
  }
  function retry() { setAnswers({}); setReview(null); setError(""); }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Check your understanding</h2><p className="mt-1 text-sm text-muted-foreground">Three focused questions. Your best score is saved.</p></div>
      <div className="rounded-full border border-border bg-muted/30 px-3 py-1 font-mono text-[11px] text-muted-foreground">{attemptCount}/{data.maxAttempts} attempts</div>
    </div>
    {data.questions.map((question, qIndex) => {
      const result = review?.find((item) => item.id === question.id);
      return <fieldset key={question.id} className="rounded-xl border border-border p-4 sm:p-5" disabled={submitted}>
        <legend className="px-1 text-sm font-semibold">{qIndex + 1}. {question.prompt}</legend>
        <div className="mt-3 grid gap-2">{question.options.map((option, index) => {
          const chosen = answers[question.id] === index || (result?.selectedIndex === index);
          const correct = result?.correctIndex === index;
          return <label key={option} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors", chosen ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30", result && correct && "border-emerald-500/50 bg-emerald-500/10", result && chosen && !correct && "border-destructive/50 bg-destructive/5")}>
            <input type="radio" name={question.id} checked={chosen} onChange={() => setAnswers((old) => ({ ...old, [question.id]: index }))} className="mt-0.5 accent-foreground" />
            <span>{option}</span>{result && correct ? <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-500" /> : null}
          </label>;
        })}</div>
        {result ? <p className={cn("mt-3 text-xs leading-5", result.correct ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{result.explanation}</p> : null}
      </fieldset>;
    })}
    {review ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-4"><div><p className="font-semibold">Score: {review.filter((item) => item.correct).length}/{review.length}</p><p className="text-xs text-muted-foreground">Best: {data.attempt?.bestScore ?? 0}/{review.length}</p></div>{attemptCount < data.maxAttempts ? <Button variant="outline" onClick={retry}>Try again</Button> : <span className="text-xs text-muted-foreground">All attempts used</span>}</div> : <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}Submit quiz</Button>}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}

function DiscussionSection({ courseSlug, moduleSlug }: { courseSlug: string; moduleSlug: string }) {
  const endpoint = `/api/lessons/${courseSlug}/${moduleSlug}/discussions`;
  const [posts, setPosts] = useState<Post[]>([]); const [text, setText] = useState(""); const [kind, setKind] = useState<"question" | "insight">("question"); const [replyTo, setReplyTo] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = async () => { const response = await fetch(endpoint); const value = await response.json(); if (response.ok) setPosts(value.posts); };
  useEffect(() => {
    let active = true;
    fetch(endpoint).then((response) => response.json()).then((value) => { if (active) setPosts(value.posts ?? []); }).catch(() => {});
    return () => { active = false; };
  }, [endpoint]);
  const roots = posts.filter((post) => !post.parentId);
  async function publish() { if (text.trim().length < 2) return; setBusy(true); setError(""); const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text, kind, parentId: replyTo }) }); const value = await response.json(); setBusy(false); if (!response.ok) { setError(response.status === 401 ? "Sign in to join the discussion." : value.error); return; } setText(""); setReplyTo(null); await load(); }
  async function vote(id: string) { const response = await fetch(`${endpoint}/${id}`, { method: "PATCH" }); if (response.status === 401) { setError("Sign in to upvote."); return; } if (response.ok) { const value = await response.json(); setPosts((old) => old.map((post) => post.id === id ? { ...post, ...value } : post)); } }
  return <div className="space-y-5">
    <div><h2 className="text-lg font-semibold">Learn with the room</h2><p className="mt-1 text-sm text-muted-foreground">Ask about a stuck point or share an insight from your implementation.</p></div>
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="mb-3 flex gap-2"><Button size="xs" variant={kind === "question" ? "default" : "outline"} onClick={() => setKind("question")}><FileQuestion />Question</Button><Button size="xs" variant={kind === "insight" ? "default" : "outline"} onClick={() => setKind("insight")}><Lightbulb />Insight</Button></div>
      {replyTo ? <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Replying to {posts.find((post) => post.id === replyTo)?.author}</span><button onClick={() => setReplyTo(null)} className="underline">Cancel</button></div> : null}
      <textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} maxLength={2000} placeholder={replyTo ? "Write a useful reply…" : "What did you notice or where are you stuck?"} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
      <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Be specific and include what you tried.</span><Button size="sm" onClick={publish} disabled={busy || text.trim().length < 2}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Post</Button></div>
      {error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
    <div className="space-y-3">{roots.length === 0 ? <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No posts yet. Start the conversation.</div> : roots.map((post) => <div key={post.id} className="rounded-xl border border-border p-4">
      <div className="flex items-center gap-2"><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium uppercase", post.kind === "insight" ? "bg-amber-500/10 text-amber-600" : "bg-sky-500/10 text-sky-600")}>{post.kind}</span><span className="text-xs font-medium">{post.author}</span><span className="text-xs text-muted-foreground">· {relativeTime(post.createdAt)}</span></div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{post.body}</p>
      <div className="mt-3 flex gap-3"><button onClick={() => void vote(post.id)} className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground", post.viewerUpvoted && "text-foreground")}><ThumbsUp className="h-3.5 w-3.5" />{post.upvoteCount}</button><button onClick={() => setReplyTo(post.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Reply className="h-3.5 w-3.5" />Reply</button></div>
      {posts.filter((reply) => reply.parentId === post.id).reverse().map((reply) => <div key={reply.id} className="mt-4 border-l-2 border-border pl-4"><p className="text-xs font-medium">{reply.author} <span className="font-normal text-muted-foreground">· {relativeTime(reply.createdAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{reply.body}</p></div>)}
    </div>)}</div>
  </div>;
}

function ResourcesSection({ courseSlug, moduleSlug, lesson }: { courseSlug: string; moduleSlug: string; lesson: ModuleManifest }) {
  const questionId = lessonKey(courseSlug, moduleSlug); const [resources, setResources] = useState<Resource[]>([]); const [url, setUrl] = useState(""); const [title, setTitle] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = async () => { const response = await fetch(`/api/resources?questionId=${encodeURIComponent(questionId)}`); const value = await response.json(); if (response.ok) setResources(value.resources); };
  useEffect(() => {
    let active = true;
    fetch(`/api/resources?questionId=${encodeURIComponent(questionId)}`).then((response) => response.json()).then((value) => { if (active) setResources(value.resources ?? []); }).catch(() => {});
    return () => { active = false; };
  }, [questionId]);
  async function add() { setBusy(true); setError(""); const response = await fetch("/api/resources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, title, type: "article", scope: { kind: "lesson", courseSlug, moduleSlug } }) }); const value = await response.json(); setBusy(false); if (!response.ok) { setError(response.status === 401 ? "Sign in to add a resource." : value.error); return; } setUrl(""); setTitle(""); await load(); }
  async function vote(id: string) { const response = await fetch(`/api/resources/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "upvote" }) }); if (response.status === 401) { setError("Sign in to upvote."); return; } if (response.ok) { const value = await response.json(); setResources((old) => old.map((item) => item.id === id ? { ...item, ...value } : item)); } }
  return <div className="space-y-5"><div><h2 className="text-lg font-semibold">Resources for this lesson</h2><p className="mt-1 text-sm text-muted-foreground">Useful references, ranked by learners. Links are validated before they are published.</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><a href={lesson.videoUrl} target="_blank" rel="noreferrer" className="group rounded-xl border border-border p-4 hover:bg-muted/30"><div className="flex items-center gap-2 text-sm font-medium"><Play className="h-4 w-4" />Original lecture<ExternalLink className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></div><p className="mt-2 text-xs text-muted-foreground">Watch on YouTube</p></a>{lesson.projects.map((project) => <Link key={project.slug} href={`/projects/${courseSlug}/${project.slug}`} className="group rounded-xl border border-border p-4 hover:bg-muted/30"><div className="flex items-center gap-2 text-sm font-medium"><BookOpen className="h-4 w-4" />{project.title}<ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" /></div><p className="mt-2 text-xs text-muted-foreground">Guided project · {project.estimatedMinutes} min</p></Link>)}</div>
    {resources.map((resource) => <div key={resource.id} className="flex items-start gap-3 rounded-xl border border-border p-4"><Link2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><a href={resource.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-4 hover:underline">{resource.title}</a><p className="mt-1 text-xs text-muted-foreground">{resource.domain}{resource.verified ? " · Verified" : ""}</p>{resource.description ? <p className="mt-2 text-sm text-muted-foreground">{resource.description}</p> : null}</div><button onClick={() => void vote(resource.id)} className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", resource.viewerUpvoted && "text-foreground")}><ThumbsUp className="h-3.5 w-3.5" />{resource.upvoteCount}</button></div>)}
    <div className="rounded-xl border border-dashed border-border p-4"><p className="text-sm font-medium">Share a useful link</p><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" /><input value={url} onChange={(e) => setUrl(e.target.value)} type="url" placeholder="https://…" className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring" /><Button onClick={add} disabled={busy || !url.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Link2 />}Add</Button></div>{error ? <p role="alert" className="mt-2 text-xs text-destructive">{error}</p> : null}</div>
  </div>;
}

export default function VideoLesson({ course, lesson, previousLesson, nextLesson }: { course: CourseManifest; lesson: ModuleManifest; previousLesson: ModuleManifest | null; nextLesson: ModuleManifest | null }) {
  const [tab, setTab] = useState<Tab>("quiz");
  const concepts = useMemo(() => Array.from(new Set(lesson.projects.flatMap((project) => project.learn?.concepts ?? []))), [lesson.projects]);
  const tabs: Array<{ id: Tab; label: string; icon: typeof FileQuestion }> = [{ id: "quiz", label: "Quiz", icon: FileQuestion }, { id: "discussion", label: "Discussion", icon: MessageCircle }, { id: "resources", label: "Resources", icon: BookOpen }];
  return <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 pb-24 pt-4 sm:px-6">
    <div className="flex items-center gap-3 border-b border-border pb-4"><Link href={`/projects/${course.slug}`} aria-label="Back to course" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">{course.title} · Lesson {lesson.order}</p><p className="truncate text-sm font-medium">{lesson.title}</p></div><div className="ml-auto hidden items-center gap-2 sm:flex">{previousLesson ? <Link href={lessonHref(course.slug, previousLesson.slug)} className={buttonVariants({ variant: "outline", size: "sm" })}><ArrowLeft />Previous</Link> : null}{nextLesson ? <Link href={lessonHref(course.slug, nextLesson.slug)} className={buttonVariants({ variant: "outline", size: "sm" })}>Next<ArrowRight /></Link> : null}</div></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0"><div className="aspect-video overflow-hidden rounded-xl border border-border bg-black shadow-2xl shadow-black/10"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${lesson.videoId}?rel=0`} title={lesson.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><div className="py-5"><p className="font-mono text-[10px] uppercase tracking-widest text-emerald-500">Video lesson {lesson.order}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{lesson.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{lesson.description}</p>{concepts.length ? <div className="mt-4 flex flex-wrap gap-2">{concepts.slice(0, 6).map((concept) => <span key={concept} className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">{concept}</span>)}</div> : null}</div></section>
      <aside className="h-[560px] overflow-hidden rounded-xl border border-border bg-card xl:sticky xl:top-5"><div className="flex h-12 items-center gap-2 border-b border-border px-4"><Sparkles className="h-4 w-4 text-emerald-500" /><span className="text-sm font-semibold">Lesson tutor</span><span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">Live</span></div><div className="h-[calc(100%-3rem)]"><ChatPanel questionId={lessonKey(course.slug, lesson.slug)} module="ds" lesson={{ courseSlug: course.slug, moduleSlug: lesson.slug, title: lesson.title }} /></div></aside>
    </div>
    <section className="mt-6 max-w-5xl rounded-xl border border-border bg-card"><div role="tablist" aria-label="Lesson activities" className="flex overflow-x-auto border-b border-border px-2 sm:px-4">{tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn("relative inline-flex h-12 items-center gap-2 px-3 text-sm font-medium text-muted-foreground", tab === item.id && "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-foreground")}><item.icon className="h-4 w-4" />{item.label}</button>)}</div><div className="p-4 sm:p-6">{tab === "quiz" ? <QuizSection courseSlug={course.slug} moduleSlug={lesson.slug} /> : tab === "discussion" ? <DiscussionSection courseSlug={course.slug} moduleSlug={lesson.slug} /> : <ResourcesSection courseSlug={course.slug} moduleSlug={lesson.slug} lesson={lesson} />}</div></section>
  </main>;
}
