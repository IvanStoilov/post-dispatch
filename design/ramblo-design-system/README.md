Ramblo publishes to your social media for you. You talk an idea through with your own AI agent (ChatGPT, Claude or any MCP-capable agent), and Ramblo turns it into posts on LinkedIn, X and the other networks you connect. Posting is the point: the brand is about getting your ideas out and seen, wherever the conversation happened. It should feel warm, sunny, confident and plain-spoken. Tagline: **Walk. Talk. Post.**

Two surfaces use this system:

- **ramblo.io** (marketing): expressive. Big `display-xl` headlines, large sun-400 blocks, `shadow-sticker`, `radius-xl` image frames.
- **app.ramblo.io** (product): calm. Mostly `sans` text styles on `surface`, Fredoka only for page and card titles, sun-400 reserved for the single primary action on a view.

Both ship in light and dark. Light is the default for ramblo.io; the app follows the system setting.

## Voice and copy

- Write like a person talking: short sentences, plain words, second person. Lead with the post and where it goes: "Your post is ready for LinkedIn and X. Review it before it goes live", never "AI-generated content has been produced".
- Say "your agent" when the agent is not known. When naming agents, list them alphabetically with equal weight ("ChatGPT, Claude and other MCP agents"). Never use an agent vendor's colors, logos or mascots in Ramblo UI.
- Name things by what people do: *connect your agent*, *pick where to post*, *review before posting*. Keep "MCP", "server" and "tool" for setup screens and docs, and set technical strings in `code` or `tool`.
- Sentence case everywhere, including buttons ("Post now", "Connect agent"). The tagline keeps its three capitalized words and periods.
- The product name in running text is **Ramblo**. The lowercase **ramblo.** with a period is the wordmark only; do not type it in body copy.
- Emoji: none in UI chrome or headings. People's own posts can contain whatever they like.
- Errors say what happened and what to do: "LinkedIn disconnected. Reconnect it in Settings to keep posting."

## Color

- **sun-400 is Ramblo.** Use it for the logo, the one primary action per view (`primary` with `on-primary` text) and big marketing blocks. On ramblo.io, sun can cover a whole section; in the app, keep it to roughly one element per screen.
- Never set sun as text or thin lines on light grounds; it fails contrast. For warning text use `warning` (sun-700 in light).
- Text is always `text` (pine-900 / cream), `text-muted` or `text-subtle` on `bg`, `surface`, `surface-raised` or `surface-sunken`. Every pair passes 4.5:1 in both themes.
- **Moss, sky and blush** are the trail accents: illustrations, category chips, platform tags, charts. Fills use the 400 step with pine-900 text on top; text uses the 700 step in light and the 300 step in dark. Do not mix more than two accents in one component.
- Status colors pair with a word or icon every time: `success` = posted, `info` = scheduled, `warning` = draft, `danger` = failed, `highlight` = new.
- The `inverse` block (pine-900 in light, cream in dark) is the secondary button and the high-contrast panel. It flips with the theme so it never disappears into the background.
- Focus: 2px solid `focus-ring` with a 2px offset on every interactive element. It meets 3:1 on every surface, including sun-400.
- No gradients. Warmth comes from flat sun, oat paper and real photography.

## Typography

- **Fredoka** (`display`, 500–600) is the voice: headlines, page titles, the wordmark. Rounded and friendly; keep it at 24px and up, and never use it for paragraphs or form labels.
- **Figtree** (`sans`, 400–700) does all reading and UI work: `body` at 16px is the app default, `body-l` at 18px for marketing paragraphs and the post preview.
- **DM Mono** (`mono`) only for MCP URLs, config snippets and tool names (`code`, `tool`).
- Keep running text near 65 characters per line. Headlines use `text-wrap: balance`.
- `overline` is the only uppercase style. Use it at most once per section.
- On screens under 640px, step display styles down one level (display-xl → display-l → display-m).

## Spacing, radius and elevation

- Spacing is a 4px scale. Card padding is `space-6` (24px) on desktop and `space-4` (16px) on mobile; page gutters are `space-10` and `space-4`.
- Ramblo is round. Buttons, chips and badges use `radius-pill`; cards and the composer `radius-lg`; inputs `radius-sm`. Avoid sharp corners anywhere a person touches.
- Elevation is soft in the app: `shadow-sm` for resting cards, `shadow-md` for menus, `shadow-lg` for dialogs. `shadow-sticker` (hard 3px offset) is a marketing-only flourish for sun buttons and sticker-like callouts.

## Motion

- Default to `duration-stroll` with `ease-stroll`: a quick start and a gentle arrival, like a post settling into a feed.
- `ease-bounce` is for small celebrations only, such as a post going live.
- Respect `prefers-reduced-motion`: replace movement with a simple fade.

## Logo

The logo is still being chosen. Five concepts about posting sit in the **Logo-concepts** asset group; all share the plain wordmark in **Logos**.

- The symbol is a sun-400 tile or speech bubble with one pine-900 posting glyph inside (send, hashtag, share, publish or broadcast), drawn from Phosphor Icons.
- The wordmark is lowercase **ramblo.** in Fredoka SemiBold, with the period as part of the mark.
- Light grounds: wordmark in pine-900. Dark grounds: wordmark in cream. The bubble stays sun-400 with a pine-900 glyph in both.
- Clear space on every side: the height of the "o". Minimum width: 88px for the wordmark, 24px for the symbol.
- Do not recolor the logo into accent colors, add gradients or outlines, or set the wordmark in another font.

## Iconography

- Use Lucide icons at a 2px stroke with round caps and joins, sized 20px in the app and 24px on marketing. The round caps match Fredoka's terminals.
- Icons take `text` or `text-muted`; on a sun fill they take `on-primary`.
- Platform icons (LinkedIn, X, Threads, Bluesky, Instagram) use each platform's own official mark in a single color, never redrawn.

## Imagery

- Show the outcome: real-looking posts in real feeds (LinkedIn, X, Threads), with the person who wrote them. Product shots show a post card with the Ramblo mark and the networks it went to.
- Photography of people in everyday places, phone in hand or in pocket. Natural light, a little grain.
- Frame photos and post mockups with `radius-xl`. A sun-400 or moss-400 block behind or beside them is the house composition.
- No AI-generated glossy art, robots, brains, sparkles or circuit patterns.
