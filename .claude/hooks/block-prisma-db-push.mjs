#!/usr/bin/env node
// PreToolUse hook (Bash): hard-deny `prisma db push`.
//
// This schema has hand-written CHECK constraints and partial unique indexes
// (poll answer bounds, review/FAQ consent) that Prisma has no first-class
// syntax for — `db push` reconciles the DB straight to the Prisma schema and
// silently drops anything it doesn't understand. See CLAUDE.md's "Alumni
// ratings" section. Migrations (`prisma migrate dev` / `migrate deploy`) are
// the only supported path.

let data = "";
process.stdin.on("data", (chunk) => {
  data += chunk;
});
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0);
  }

  const command = input?.tool_input?.command ?? "";

  // Match only an actual invocation, anchored to the start of the command or
  // a top-level `&&`/`||` chain (this repo's own documented pattern for
  // prisma commands is `set -a && source .env && ... && npx prisma ...`) —
  // not a blind substring search. A substring search also matches quoted
  // text elsewhere in the command (e.g. this very phrase inside a
  // `git commit -m "..."` message), which is a real false positive this
  // hook hit during its own rollout. `;` is deliberately not a split point:
  // unlike `&&`/`||`, it's common inside quoted prose (commit messages,
  // echoed text) and splitting on it reintroduced the same false-positive
  // class one level down.
  const invokesDbPush = command
    .split(/&&|\|\|/)
    .some((segment) =>
      /^\s*(?:sudo\s+)?(?:npx|pnpm\s+(?:exec|dlx)|yarn(?:\s+dlx)?|bunx|npm\s+exec)?\s*prisma\s+db\s+push\b/.test(
        segment
      )
    );

  if (invokesDbPush) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            "Blocked: `prisma db push` drops the hand-written CHECK constraints and partial unique indexes in prisma/schema.prisma (PollAnswer value bounds, PollReview/ProgramFAQ consent checks, PollResponse partial unique indexes) because Prisma has no first-class syntax for them and `db push` silently reconciles them away. Use `npx prisma migrate dev --name <description>` locally or `npx prisma migrate deploy` against a Neon branch/production instead.",
        },
      })
    );
  }
  process.exit(0);
});
