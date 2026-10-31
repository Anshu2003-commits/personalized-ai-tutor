# Landing page assets - shot list

Drop screenshots here with these exact filenames and the page picks them up
(until then, each slot renders a labeled dashed placeholder, so nothing breaks).

After adding a file, set its `src` on the matching `<Screenshot>`:
e.g. in `components/landing/hero.tsx` add `src="/landing/hero-solve-view.png"`.

Current assets are ~2:1 (1916×961). Keep new captures at the same ratio so they
swap in without layout shift.

| Filename                     | Where it shows         | Ratio | Px        | What must be visible |
|------------------------------|------------------------|-------|-----------|----------------------|
| `hero-solve-view.png`        | Hero (the big one)     | 2:1   | 1916×961  | The 3-pane solve view: problem statement, code editor, mentor chat - all at once. This is the money shot. |
| `step-roadmap.png`           | How it works · step 01 | 2:1   | 1916×961  | The roadmap/curriculum view with topics ordered, some marked done. |
| `step-editor-tests.png`      | How it works · step 02 | 2:1   | 1916×961  | Code in the editor with test results passing (green checks) underneath. |
| `step-mentor.png`            | How it works · step 03 | 2:1   | 1916×961  | A mentor reply giving a hint, not the full answer. |

## Capture tips
- Use the **dark** theme (the site is dark) so shots blend into the page.
- Crop tight to the UI - no OS chrome, no browser bars (the component adds its own frame).
- Export at 2× / retina for crispness, then the listed display size is fine.
- Real content beats lorem - a recognizable problem (e.g. Two Sum) reads as authentic.

## Optional / later
- `hero-demo.mp4` or `.webm` - a 5-8s silent loop of one solve, to replace the
  static hero shot for higher conversion. Ask and I'll wire up an autoplay/muted
  loop with the static PNG as the poster fallback.
