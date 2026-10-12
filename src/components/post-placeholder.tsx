/** A lightweight illustration for posts that publish without media. */
export function PostPlaceholder() {
  return (
    <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden bg-secondary">
      <svg
        viewBox="0 0 400 300"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <circle cx="200" cy="146" r="100" className="fill-primary/10" />
        <circle cx="276" cy="91" r="31" className="fill-primary" />
        <path
          d="M82 212c23-20 43-8 55 5s29 17 42 3"
          className="fill-none stroke-primary"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <g transform="rotate(-9 200 150)">
          <rect
            x="125"
            y="92"
            width="155"
            height="120"
            rx="20"
            className="fill-foreground/10"
          />
        </g>
        <path
          d="M139 85h117a18 18 0 0 1 18 18v83a18 18 0 0 1-18 18h-70l-29 24v-24h-18a18 18 0 0 1-18-18v-83a18 18 0 0 1 18-18Z"
          className="fill-card stroke-border"
          strokeWidth="2"
        />
        <path
          d="M147 119h76M147 140h100M147 161h62"
          className="stroke-foreground/30"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="m304 171 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z"
          className="fill-primary"
        />
        <circle cx="95" cy="110" r="4" className="fill-foreground/20" />
        <circle cx="293" cy="230" r="3" className="fill-foreground/20" />
      </svg>
      <span className="absolute bottom-4 text-xs font-medium text-muted-foreground">
        Text post
      </span>
    </div>
  );
}
