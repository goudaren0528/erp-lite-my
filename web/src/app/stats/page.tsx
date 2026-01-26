import { redirect } from "next/navigation";

export default function StatsRootPage() {
  redirect("/stats/accounts");
}
