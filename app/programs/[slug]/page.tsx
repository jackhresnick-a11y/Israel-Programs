import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SignInButton, Show } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { getProgramBySlug, DURATION_LABELS, averageRating } from "@/lib/programs";
import { listPublishedReferences } from "@/lib/references";
import { getCurrentRole } from "@/lib/roles";
import ReviewForm from "@/components/ReviewForm";
import ReviewList from "@/components/ReviewList";
import VideoUploader from "@/components/VideoUploader";
import VideoList from "@/components/VideoList";
import DeleteProgramButton from "@/components/DeleteProgramButton";
import BackButton from "@/components/BackButton";
import ReferenceForm from "@/components/ReferenceForm";
import ReferenceList from "@/components/ReferenceList";

export default async function ProgramDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string; editPending?: string }>;
}) {
  const { slug } = await params;
  const [program, role, { userId }, query] = await Promise.all([
    getProgramBySlug(slug),
    getCurrentRole(),
    auth(),
    searchParams,
  ]);
  if (!program) notFound();

  const isModerator = role === "moderator" || role === "admin";
  const isOwner = userId === program.createdById;
  if (program.status !== "PUBLISHED" && !isModerator && !isOwner) notFound();

  const references = await listPublishedReferences(program.id);
  const rating = averageRating(program.reviews);

  // Exactly one banner ever renders — a just-submitted confirmation takes
  // priority over the program's persistent status, so the two never stack.
  const banner =
    query.created === "pending"
      ? { tone: "info" as const, text: "Thanks! Your submission is awaiting moderator approval." }
      : query.editPending === "1"
        ? { tone: "info" as const, text: "Thanks! Your proposed edit is awaiting moderator approval." }
        : program.status === "PENDING"
          ? { tone: "warning" as const, text: "This program is awaiting moderator approval and isn't public yet." }
          : program.status === "REJECTED"
            ? { tone: "danger" as const, text: "This submission was rejected by a moderator and isn't public." }
            : null;

  const bannerClass = {
    info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <BackButton fallbackHref="/programs" />
      {banner && (
        <p className={`rounded-lg px-4 py-2 text-sm ${bannerClass[banner.tone]}`}>
          {banner.text}
        </p>
      )}
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
        <div className="flex gap-2">
          <Link
            href={`/programs/${program.slug}/edit`}
            className="rounded-lg border border-primary/20 px-3 py-1.5 text-sm text-primary hover:bg-primary/5 dark:border-white/15 dark:text-white dark:hover:bg-white/[.06]"
          >
            Edit
          </Link>
          {isModerator && <DeleteProgramButton id={program.id} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {program.tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/programs?tags=${tag.slug}`}
            className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
          >
            #{tag.slug}
          </Link>
        ))}
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/80 dark:text-white/80">
        {program.description}
      </p>

      {program.goodFor && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Who it&apos;s for
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-black/80 dark:text-white/80">
            {program.goodFor}
          </p>
        </div>
      )}

      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-blue-100 p-5 text-sm sm:grid-cols-2 dark:border-blue-950">
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
              className="mt-1 inline-block text-sm text-amber-700 underline hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
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
                className="text-amber-700 underline hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
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
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className="w-fit rounded-lg border border-black/10 px-4 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]">
                Sign in to add a video
              </button>
            </SignInButton>
          }
        >
          <VideoUploader programId={program.id} />
        </Show>
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

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Alumni References</h2>
        <p className="text-sm text-black/60 dark:text-white/60">
          People who attended this program and are willing to answer honest
          questions about their real experience.
        </p>
        <ReferenceList references={references} isModerator={isModerator} />
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className="w-fit rounded-lg border border-black/10 px-4 py-1.5 text-sm hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.06]">
                Sign in to volunteer as a reference
              </button>
            </SignInButton>
          }
        >
          <ReferenceForm programId={program.id} />
        </Show>
      </section>
    </div>
  );
}
