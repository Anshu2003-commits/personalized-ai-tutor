import TrackRoadmap from "@/components/track-roadmap";

type Props = {
  searchParams?: Promise<{ module?: string; step?: string }>;
};

export default async function DsRoadmapPage({ searchParams }: Props) {
  const params = await searchParams;
  return <TrackRoadmap track="ds" module={params?.module ?? params?.step} />;
}
