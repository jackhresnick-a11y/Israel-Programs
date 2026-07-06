import { clerkClient } from "@clerk/nextjs/server";

export type SubmitterInfo = { name: string; email: string };

/** Batch-fetches display name + email for a set of Clerk user ids. */
export async function getUsersByIds(userIds: string[]): Promise<Map<string, SubmitterInfo>> {
  const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
  if (uniqueIds.length === 0) return new Map();

  const client = await clerkClient();
  const { data } = await client.users.getUserList({ userId: uniqueIds, limit: uniqueIds.length });

  return new Map(
    data.map((user) => [
      user.id,
      {
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Unknown",
        email: user.primaryEmailAddress?.emailAddress ?? "",
      },
    ])
  );
}
