import type { Metadata } from "next";
import TutorPageShell, {
  generateTutorMetadata,
  generateTutorStaticParams,
} from "@/components/tutor-page-shell";

type Props = {
  params: Promise<{ slug: string; questionId: string }>;
};

export function generateStaticParams() {
  return generateTutorStaticParams("dsa");
}

export function generateMetadata(props: Props): Promise<Metadata> {
  return generateTutorMetadata({ track: "dsa", params: props.params });
}

export default function DsaQuestionTutorPage(props: Props) {
  return <TutorPageShell track="dsa" params={props.params} />;
}
