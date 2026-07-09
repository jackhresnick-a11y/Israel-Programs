import { Fragment } from "react";

/** Renders `**bold**` markers as <strong>; unmatched markers degrade to literal text. */
export default function FormattedText({ text }: { text: string }) {
  const segments = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {segments.map((segment, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {segment}
          </strong>
        ) : (
          <Fragment key={i}>{segment}</Fragment>
        )
      )}
    </>
  );
}
