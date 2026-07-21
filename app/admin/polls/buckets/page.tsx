import { redirect } from "next/navigation";
import { getCurrentRole } from "@/lib/roles";
import { listBuckets, listQuestions } from "@/lib/pollQuestions";
import { listBucketRules } from "@/lib/pollBucketRules";
import { listAllTags } from "@/lib/programs";
import { listDurationOptions } from "@/lib/duration";
import BucketManager from "@/components/admin/polls/BucketManager";
import BucketRuleManager from "@/components/admin/polls/BucketRuleManager";

export default async function AdminPollsBucketsPage() {
  const role = await getCurrentRole();
  if (role !== "admin") redirect("/");

  const [buckets, questions, rules, tags, durationOptions] = await Promise.all([
    listBuckets(),
    listQuestions(),
    listBucketRules(),
    listAllTags(),
    listDurationOptions(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <BucketManager buckets={buckets} questions={questions} />
      <BucketRuleManager
        rules={rules}
        buckets={buckets}
        tags={tags}
        durationOptions={durationOptions.filter((d) => d.value !== "CUSTOM")}
      />
    </div>
  );
}
