export function TermsDocument({ content }: { content: string }) {
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground">
      {content}
    </pre>
  );
}
