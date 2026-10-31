import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getQuestionById,
  getTopicBySlug,
} from "@/lib/catalog";
import {
  tutorPath,
  questionDescription,
  questionKeywords,
} from "@/lib/seo";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = getTopicBySlug("ds", slug);
  if (!topic) {
    return {
      title: "Data Science practice problem | Onlearn",
      robots: { index: false, follow: false },
    };
  }

  const selectedId = await selectedQuestionId(searchParams, topic.question_ids);
  const question = selectedId ? getQuestionById(selectedId) : undefined;
  const title = question
    ? `${question.question_title} | Data Science practice | Onlearn`
    : `${topic.title} | Data Science practice | Onlearn`;
  const description = question
    ? questionDescription(question)
    : `Practice ${topic.title} with an AI tutor on Onlearn.`;
  const path = tutorPath("ds", topic.slug, question?.question_id);

  return {
    title,
    description,
    keywords: question ? questionKeywords(question) : [topic.title, "Data Science"],
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: path,
      siteName: "Onlearn",
      type: "article",
    },
  };
}

export default async function DsTutorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const topic = getTopicBySlug("ds", slug);
  if (!topic) notFound();

  const selectedId = await selectedQuestionId(searchParams, topic.question_ids);
  if (!selectedId) notFound();
  permanentRedirect(tutorPath("ds", topic.slug, selectedId));
}

async function selectedQuestionId(
  searchParams: Props["searchParams"],
  validIds: string[],
): Promise<string | undefined> {
  const q = (await searchParams)?.q;
  const requested = Array.isArray(q) ? q[0] : q;
  return requested && validIds.includes(requested) ? requested : validIds[0];
}
