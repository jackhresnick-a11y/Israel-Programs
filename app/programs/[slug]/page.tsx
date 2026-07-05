import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SignInButton, Show } from "@clerk/nextjs";
import { getProgramBySlug, DURATION_LABELS, averageRating } from "@/lib/programs";
import { getCurrentRole } from "@/lib/roles";
import ReviewForm from "@/components/ReviewForm";
import ReviewList from "@/components/ReviewList";
import VideoUploader from "@/components/VideoUploader";
import VideoList from "@/components/VideoList";
import DeleteProgramButton from "@/components/DeleteProgramButton";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const program = await getProgramBySlug(slug);
  if (!program) notFound();

  const role = await getCurrentRole();
  const isModerator = role === "moderator" || role === "admin";
  const rating = averageRating(program.reviews);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/5 dark:bg-white/10">
          {program.logoUrl ? (
            <Image
              src={program.logoUrl}
              alt={`${program.name} logo`}
              width={64}
              height={64}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-2xl font-semibold text-black/40 dark:text-white/40">
              {program.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {program.name}
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {program.organization}
            {program.location ? ` · ${program.location}` : ""}
          </p>
          {rating !== null && (
            <p className="mt-1 text-sm text-amber-500">
              {"★".repeat(Math.round(rating))}
              <span className="ml-1 text-black/50 dark:text-white/50">
                {rating.toFixed(1)} ({program.reviews.length} review
                {program.reviews.length === 1 ? "" : "s"})
              </span>
            </p>
          )}
        </div>
        {isModerator && (
          <div className="flex gap-2">
            <Link
              href={`/programs/${program.slug}/edit`}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]"
            >
              Edit
            </Link>
            <DeleteProgramButton id={program.id} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {program.tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/programs?tag=${tag.slug}`}
            className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-black/60 hover:bg-black/10 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15"
          >
            #{tag.slug}
          </Link>
        ))}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80 dark:text-white/80">
        {program.description}
      </p>

      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-black/10 p-5 text-sm sm:grid-cols-2 dark:border-white/10">
        <div>
          <dt className="font-medium text-black/50 dark:text-white/50">Duration</dt>
          <dd>
            {DURATION_LABELS[program.durationType]}
            {program.durationText ? ` — ${program.durationText}` : ""}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-black/50 dark:text-white/50">Cost</dt>
          <dd>{program.cost || "Not listed"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-black/50 dark:text-white/50">
            How to sign up
          </dt>
          <dd className="whitespace-pre-wrap">
            {program.signupInstructions || "Contact the program directly."}
          </dd>
          {program.signupUrl && (
            <a
              href={program.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-sm underline"
            >
              {program.signupUrl}
            </a>
          )}
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-black/50 dark:text-white/50">Contact</dt>
          <dd className="flex flex-col gap-0.5">
            {program.contactEmail && <span>{program.contactEmail}</span>}
            {program.contactPhone && <span>{program.contactPhone}</span>}
            {program.contactWebsite && (
              <a
                href={program.contactWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {program.contactWebsite}
              </a>
            )}
            {!program.contactEmail && !program.contactPhone && !program.contactWebsite && (
              <span>Not listed</span>
            )}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Videos</h2>
        <VideoList videos={program.videos} isModerator={isModerator} />
        {isModerator && <VideoUploader programId={program.id} />}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Reviews</h2>
        <ReviewList reviews={program.reviews} isModerator={isModerator} />
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className="w-fit rounded-lg border border-black/10 px-4 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]">
                Sign in to leave a review
              </button>
            </SignInButton>
          }
        >
          <ReviewForm programId={program.id} />
        </Show>
      </section>
    </div>
  );
}
