#!/usr/bin/env node
// PreToolUse hook (Edit/Write): require explicit confirmation for .env* files.
//
// DATABASE_URL, Clerk secret keys, RESEND_FROM, POLL_IP_SALT, and
// BLOB_READ_WRITE_TOKEN all live in .env/.env.local, and this project's DB is
// shared live between local dev and production — an accidental edit here has
// real blast radius. Matching is done here on tool_input.file_path rather
// than via the hook `if` filter, since Write-tool path patterns aren't
// reliably consulted the same way Edit-tool ones are.

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

  const filePath = input?.tool_input?.file_path ?? "";
  const basename = filePath.split("/").pop() ?? "";
  if (/^\.env/.test(basename)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `Editing an env file (${filePath}) — DATABASE_URL and other secrets shared with production live here. Confirm this edit is intentional.`,
        },
      })
    );
  }
  process.exit(0);
});
