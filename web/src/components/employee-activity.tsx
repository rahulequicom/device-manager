"use client";
import { ActivityFeed } from "./activity-feed";
import useSWR from "swr";
import { loadEmployeeActivity } from "@/lib/employee-api";
import type { Member } from "@/lib/device-data";

export function EmployeeActivity({ memberId, admin, members, revision }: { memberId: string | null; admin: boolean; members: Member[]; revision: number }) {
  const activity = useSWR(["employee-activity", memberId, admin, revision], () => loadEmployeeActivity(memberId, admin), { refreshInterval: 30000 });
  return <ActivityFeed data={activity.data} error={activity.error} loading={activity.isLoading} refreshing={activity.isValidating} onRefresh={() => { void activity.mutate(); }} admin={admin} members={members} />;
}
