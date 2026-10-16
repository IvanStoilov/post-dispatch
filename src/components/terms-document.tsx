import Markdown from "react-markdown";

export function TermsDocument({ content }: { content: string }) {
  // Previously accepted plain-text snapshots remain exactly as originally stored.
  if (!content.startsWith("# ")) {
    return (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground">
        {content}
      </pre>
    );
  }
  return (
    <div className="space-y-5 text-sm leading-7 text-foreground">
      <Markdown
        skipHtml
        components={{
          h1: ({ children }) => <h1 className="display-m">{children}</h1>,
          h2: ({ children }) => <h2 className="heading-l">{children}</h2>,
          h3: ({ children }) => <h3 className="heading-m">{children}</h3>,
          a: ({ children, href }) => (
            <a href={href} className="document-link">
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="list-disc space-y-2 pl-6">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-2 pl-6">{children}</ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="rounded-lg border-l-4 border-primary bg-primary/10 px-4 py-3">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
