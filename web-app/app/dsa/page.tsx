import TrackRoadmap from "@/components/track-roadmap";

type Props = {
  searchParams?: Promise<{ module?: string; step?: string }>;
};

export default async function DsaRoadmapPage({ searchParams }: Props) {
  const params = await searchParams;
  return <TrackRoadmap track="dsa" module={params?.module ?? params?.step} />;
}
