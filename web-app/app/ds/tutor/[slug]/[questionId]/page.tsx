import type { Metadata } from "next";
import TutorPageShell, {
  generateTutorMetadata,
  generateTutorStaticParams,
} from "@/components/tutor-page-shell";

type Props = {
  params: Promise<{ slug: string; questionId: string }>;
};

export function generateStaticParams() {
  return generateTutorStaticParams("ds");
}

export function generateMetadata(props: Props): Promise<Metadata> {
  return generateTutorMetadata({ track: "ds", params: props.params });
}

export default function DsQuestionTutorPage(props: Props) {
  return <TutorPageShell track="ds" params={props.params} />;
}
