import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listBuckets, listQuestions } from "@/lib/pollQuestions";
import BucketManager from "@/components/admin/polls/BucketManager";

export default async function AdminPollsBucketsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [buckets, questions] = await Promise.all([listBuckets(), listQuestions()]);

  return <BucketManager buckets={buckets} questions={questions} />;
}
