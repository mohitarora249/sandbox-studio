import { CircleCheck, CircleDashed, CircleStop, LoaderCircle, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type SandboxStatus = "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED" | "DELETING" | "DELETED";

const config = {
  RUNNING: { label: "Running", tone: "success" as const, Icon: CircleCheck },
  STOPPED: { label: "Stopped", tone: "muted" as const, Icon: CircleStop },
  PROVISIONING: { label: "Provisioning", tone: "default" as const, Icon: LoaderCircle },
  DELETING: { label: "Deleting", tone: "warning" as const, Icon: LoaderCircle },
  DELETED: { label: "Deleted", tone: "muted" as const, Icon: CircleDashed },
  FAILED: { label: "Failed", tone: "danger" as const, Icon: TriangleAlert },
};

export function StatusBadge({ status }: { status: SandboxStatus }) {
  const item = config[status] ?? config.FAILED;
  const Icon = item.Icon;
  return <Badge tone={item.tone}><Icon className={`h-3 w-3 ${status === "PROVISIONING" || status === "DELETING" ? "animate-spin" : ""}`} />{item.label}</Badge>;
}
