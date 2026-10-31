import type { Question, Topic, TrackSlug } from "@/lib/types";
import {
  absoluteTutorUrl,
  plainText,
  questionDescription,
  questionKeywords,
} from "@/lib/seo";

type Props = {
  track: TrackSlug;
  topic: Topic;
  question: Question;
};

export default function TutorSeoSummary({ track, topic, question }: Props) {
  const url = absoluteTutorUrl(track, topic.slug, question.question_id);
  const keywords = questionKeywords(question);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: question.question_title,
    description: questionDescription(question),
    url,
    educationalLevel: "Beginner to intermediate",
    learningResourceType: question.has_code ? "Practice problem" : "Lesson",
    isAccessibleForFree: true,
    teaches: keywords,
    about: topic.title,
    provider: {
      "@type": "Organization",
      name: "Onlearn",
      url: "https://onlearn.app",
    },
  };

  return (
    <section className="sr-only" aria-label="Problem summary for search">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1>{question.question_title}</h1>
      <p>
        {topic.title} {track.toUpperCase()} practice problem on Onlearn.
      </p>
      <p>Difficulty: {question.difficulty}.</p>
      {keywords.length > 0 && <p>Topics: {keywords.join(", ")}.</p>}
      <div>{plainText(question.question)}</div>
    </section>
  );
}
