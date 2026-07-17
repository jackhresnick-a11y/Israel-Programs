import { prisma } from "@/lib/prisma";
import {
  resolvePollQuestionSet,
  type PollBucketDTO,
  type PollQuestionDTO,
  type ResolvedPollQuestionSet,
} from "@/lib/pollShared";
import type { PollDisplayFormat } from "@/app/generated/prisma/enums";

export type ProgramPollConfigDTO = {
  bucketIds: string[];
  addedQuestionIds: string[];
  removedQuestionIds: string[];
  resultsVisible: boolean;
  minResponsesToPublish: number;
  displayFormat: PollDisplayFormat;
  placeholderOverride: string | null;
};

const DEFAULT_POLL_CONFIG: ProgramPollConfigDTO = {
  bucketIds: [],
  addedQuestionIds: [],
  removedQuestionIds: [],
  resultsVisible: false,
  minResponsesToPublish: 7,
  displayFormat: "STARS",
  placeholderOverride: null,
};

/** A missing row reads as these schema defaults rather than throwing -- a program
 * created after prisma/seed-polls.ts ran (or any future program) degrades gracefully
 * instead of 500ing the program page or the /rate form. */
export async function getProgramPollConfig(programId: string): Promise<ProgramPollConfigDTO> {
  const row = await prisma.programPollConfig.findUnique({ where: { programId } });
  if (!row) return DEFAULT_POLL_CONFIG;
  return {
    bucketIds: row.bucketIds,
    addedQuestionIds: row.addedQuestionIds,
    removedQuestionIds: row.removedQuestionIds,
    resultsVisible: row.resultsVisible,
    minResponsesToPublish: row.minResponsesToPublish,
    displayFormat: row.displayFormat,
    placeholderOverride: row.placeholderOverride,
  };
}

function toBucketDTO(b: {
  id: string;
  name: string;
  description: string | null;
  questionIds: string[];
  order: number;
  isCore: boolean;
  status: "ACTIVE" | "RETIRED";
}): PollBucketDTO {
  return b;
}

function toQuestionDTO(q: {
  id: string;
  key: string;
  text: string;
  type: "STARS" | "RADIO" | "DROPDOWN";
  labels: string[];
  dropdownOptions: unknown;
  version: number;
  status: "ACTIVE" | "RETIRED";
}): PollQuestionDTO {
  return q;
}

/** Resolves the live question set (Core + any extra buckets, minus removals, plus
 * per-program additions) for one program's rating form. Fetches every bucket/question --
 * at the question-bank sizes this system is designed for (a handful of buckets, tens of
 * questions) that's cheap, and it lets the pure resolvePollQuestionSet in lib/pollShared.ts
 * stay the single source of truth for the resolution logic instead of duplicating it in
 * a query. */
export async function getQuestionsForProgram(programId: string): Promise<ResolvedPollQuestionSet> {
  const [config, buckets, questions] = await Promise.all([
    getProgramPollConfig(programId),
    prisma.questionBucket.findMany(),
    prisma.pollQuestion.findMany(),
  ]);
  return resolvePollQuestionSet(config, buckets.map(toBucketDTO), questions.map(toQuestionDTO));
}
