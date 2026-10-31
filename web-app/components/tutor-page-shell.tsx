import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TutorSeoSummary from "@/components/tutor-seo-summary";
import TutorView from "@/components/tutor-view";
import {
  getQuestionById,
  getQuestionsForTopic,
  getTopicBySlug,
  getTopicsByTrack,
} from "@/lib/catalog";
import {
  absoluteTutorUrl,
  questionDescription,
  questionKeywords,
} from "@/lib/seo";
import type { QuestionMeta, TrackSlug } from "@/lib/types";

type TutorParams = {
  slug: string;
  questionId: string;
};

type TutorShellProps = {
  track: TrackSlug;
  params: Promise<TutorParams>;
};

export function generateTutorStaticParams(track: TrackSlug): TutorParams[] {
  return getTopicsByTrack(track).flatMap((topic) =>
    topic.question_ids.map((questionId) => ({
      slug: topic.slug,
      questionId,
    })),
  );
}

export async function generateTutorMetadata({
  track,
  params,
}: TutorShellProps): Promise<Metadata> {
  const { slug, questionId } = await params;
  const topic = getTopicBySlug(track, slug);
  if (!topic || !topic.question_ids.includes(questionId)) {
    return {
      title:
        track === "dsa"
          ? "DSA practice problem | Onlearn"
          : "Data Science practice problem | Onlearn",
      robots: { index: false, follow: false },
    };
  }

  const question = getQuestionById(questionId);
  if (!question) {
    return {
      title:
        track === "dsa"
          ? "DSA practice problem | Onlearn"
          : "Data Science practice problem | Onlearn",
      robots: { index: false, follow: false },
    };
  }

  const trackLabel = track === "dsa" ? "DSA" : "Data Science";
  const title =
    track === "dsa"
      ? `${question.question_title} | DSA practice problem | Onlearn`
      : `${question.question_title} | Data Science practice | Onlearn`;
  const description = questionDescription(question);
  const url = absoluteTutorUrl(track, topic.slug, question.question_id);

  return {
    title,
    description,
    keywords: questionKeywords(question),
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: "Onlearn",
      type: "article",
    },
    other: {
      "article:section": trackLabel,
    },
  };
}

export default async function TutorPageShell({ track, params }: TutorShellProps) {
  const { slug, questionId } = await params;
  const topic = getTopicBySlug(track, slug);
  if (!topic || !topic.question_ids.includes(questionId)) notFound();

  const selectedQuestion = getQuestionById(questionId);
  if (!selectedQuestion) notFound();

  const questions: QuestionMeta[] = getQuestionsForTopic(track, slug).map(
    (q) => ({
      id: q.question_id,
      title: q.question_title,
      difficulty: q.difficulty,
    }),
  );

  return (
    <main className="flex flex-1 flex-col">
      <TutorSeoSummary
        track={track}
        topic={topic}
        question={selectedQuestion}
      />
      <Suspense fallback={<div className="h-dvh bg-background" />}>
        <TutorView
          track={track}
          topicSlug={topic.slug}
          topicTitle={topic.title}
          questions={questions}
          initialQuestionId={questionId}
        />
      </Suspense>
    </main>
  );
}
