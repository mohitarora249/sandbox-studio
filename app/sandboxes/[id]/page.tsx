import { SandboxDetail } from "@/components/sandbox-detail";

type PageProps = { params: Promise<{ id: string }> };

export default async function SandboxDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <SandboxDetail id={id} />;
}
