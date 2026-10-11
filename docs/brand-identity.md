# ramblo.

**Walk. Talk. Post.**  
**ramblo.io** · Brand identity

## The idea

Ramblo makes space for ideas to become posts. The identity takes its cue from a good ramble: curious, unhurried, and human. Warm color, clear language, and generous space make the publishing workflow feel approachable. Precision in the interface keeps approval and delivery trustworthy.

The name and tagline express the brand’s direction. They should not imply that voice recording or automatic publishing already exists. Describe the current product honestly: AI-assisted drafts, human review, connected social accounts.

## Name and wordmark

- Company/product name in prose: **Ramblo**. Domain: **ramblo.io**.
- Wordmark: **ramblo.**, always lowercase, with the period attached. The period is the signature: the moment an idea becomes a finished thought.
- Set the wordmark in DM Sans 800, tracking −0.06em. Use Forest on Ivory, Ivory on Forest, or solid black for monochrome reproduction. The period may use Terracotta on light surfaces or Apricot on dark surfaces.
- Keep clear space equal to the height of the lowercase “o”. Minimum display width: 88px. Below that, use a separately designed compact mark; do not squeeze the wordmark.
- Keep the tagline in regular sentence-style lettering: **Walk. Talk. Post.** Do not incorporate the domain into the wordmark.
- The app includes the wordmark and a compact R mark inspired by a wandering line ending in a dot.

## Palette

| Token            | Name       | Hex       | Role                                           |
| ---------------- | ---------- | --------- | ---------------------------------------------- |
| background       | Warm Ivory | `#FAF8F2` | Main canvas; generous negative space           |
| foreground       | Forest Ink | `#283D32` | Text, wordmark, occasional solid brand panels  |
| primary          | Terracotta | `#B84F36` | Main action, selected state, brand punctuation |
| brand-apricot    | Apricot    | `#FFD4A3` | Warm highlights; use Forest text               |
| secondary        | Soft Sage  | `#E9EEE6` | Secondary buttons, gentle emphasis             |
| card             | Paper      | `#FFFFFF` | Cards, fields, popovers                        |
| muted-foreground | Stone      | `#647067` | Supporting text                                |
| border           | Linen      | `#DEDCD3` | Decorative dividers and card edges             |
| input            | Field edge | `#879086` | Visible input/control boundaries               |

Use approximately 70% Ivory/Paper, 20% Forest/Sage, 10% Terracotta/Apricot in marketing layouts. These are composition guidelines, not UI quotas. Reserve primary actions for Terracotta; a brand panel may use Forest. Avoid orange text on white, beige text on beige, gradients, and using accent colors for every card.

## Typography

One family: **DM Sans**, self-hosted. Its open-source license is included with the preview. Use variable weights 400–800; use the system monospace stack only for identifiers or technical values.

| Role               | Desktop / mobile | Weight | Line height | Tracking |
| ------------------ | ---------------- | ------ | ----------- | -------- |
| Campaign display   | 112px / 56px     | 700    | 1.00        | −0.055em |
| Marketing headline | 72px / 40px      | 700    | 1.05        | −0.045em |
| Page title         | 32px / 28px      | 700    | 1.15        | −0.035em |
| Section heading    | 24px             | 600    | 1.25        | −0.02em  |
| Body               | 16px             | 400    | 1.60        | Normal   |
| UI label / button  | 14px             | 600    | 1.40        | Normal   |
| Supporting text    | 14px             | 400    | 1.50        | Normal   |
| Metadata           | 12px             | 500    | 1.40        | Normal   |

Limit body copy to approximately 60–70 characters per line. Compact product views may use 14px body text. Keep uppercase for short editorial labels; form labels and actions use sentence case.

## Shape, space, and movement

- Spacing scale: **4, 8, 12, 16, 24, 32, 48, 64, 96px**. Use 16px between related controls, 24px card padding, 32px between groups, 64–96px between marketing sections.
- Controls: **12px radius**. Cards: **20px**. Large brand panels: **32px**. Pills are reserved for tags and small statuses.
- Minimum interactive target: **44×44px**. Button horizontal padding: 20px; control height: 44px.
- Layout: maximum marketing width 1200px; workspace width 1440px; forms 400px. Gutters: 20px mobile, 32px tablet, 48px desktop.
- Prefer fine borders over heavy shadows. Subtle card shadow: `0 2px 8px rgb(40 61 50 / 4%)`. Popover shadow: `0 12px 40px rgb(40 61 50 / 12%)`.
- Icons: Lucide, 1.75px stroke, 18–20px in controls. Always pair unfamiliar icons with labels.
- Brand motif: a single wandering line, generous curves, and one ending dot. Keep it decorative, sparse, and away from reading surfaces.
- Motion: 120ms small feedback, 180ms normal transitions, 240ms panels. Animate opacity and small translations; no perpetual movement. Respect reduced-motion preferences.

## Status and accessibility

Status colors are semantic, not extra brand accents. Pair color with a word and, where useful, an icon.

| State                  | Foreground | Background |
| ---------------------- | ---------- | ---------- |
| Published / success    | `#246044`  | `#E7EFE8`  |
| Needs review / warning | `#805414`  | `#FFF0D6`  |
| Failed / error         | `#A82F35`  | `#FCE9E7`  |
| Processing / info      | `#315A80`  | `#E8F0F8`  |

Measured text contrast: Forest/Ivory **10.96:1**, Stone/Ivory **4.88:1**, White/Terracotta **4.99:1**. All listed light status pairs exceed 5.7:1. Field edge/Paper is **3.30:1**; Linen is a decorative border and must not be the only boundary for an input. Focus uses a 2px ring with a 3px offset. Underline inline links. Use a separate disabled state and keep error/help messages visible.

The dark theme uses Forest Charcoal `#17221C`, raised surfaces `#202E25`, Ivory text, and Peach `#F2AA89` for primary actions with dark text `#2A211D`. It is a semantic remap, not an inverted light palette. The paired primary text contrast is **8.16:1**. See the supplied CSS for all semantic tokens.

Contrast numbers describe the supplied solid-color pairs; they do not certify a future interface. Verify actual components, focus states, imagery, and disabled styles when implementing.

## Voice

Clear, encouraging, and specific. Prefer “Your draft is ready to review”, “Connect Instagram”, and “Approve & publish”. Explain the next step when something fails. Keep playful language for marketing; publishing errors need direct instructions. Avoid hype, “AI magic”, and language suggesting a post went live before the network confirms it.

## Original design kit

- `index.html`: self-contained visual brand board, theme toggle, color copying, typography and component specimens.
- `tailwind-theme.css`: Tailwind 4 / shadcn token proposal. Integrate deliberately into the existing stylesheet; do not replace the app’s CSS wholesale.
- `tokens.json`: palette, scales, and measured contrast pairs.
- `font.css` and `assets/`: DM Sans font files and SIL Open Font License.

Font source: [Google Fonts’ DM Sans repository](https://github.com/google/fonts/tree/main/ofl/dmsans). These tokens and self-hosted fonts are now integrated in Ramblo. App components use Tailwind 4 semantic utilities.

## Contact

Public support, privacy and account-deletion contact: **hello@ramblo.io**. The legal operator remains **Growth Optimize SL**, Spain.
