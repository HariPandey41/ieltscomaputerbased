# IELTS Listening — Computer-Based Mock Test

A self-contained static site that simulates the computer-delivered IELTS
Listening test: audio plays once with no pause or rewind, students answer
as they listen, and a full mark scheme with an estimated band appears at
the end. No backend, no build step — works directly on GitHub Pages.

## Folder structure

```
ielts-listening-mock/
├── index.html              Home page — lists every test in data/tests-manifest.json
├── test.html               The exam screen (used for every test, via ?test=<id>)
├── css/
│   └── style.css
├── js/
│   └── engine.js           All exam logic: timing, audio lock, scoring, results
├── data/
│   ├── tests-manifest.json Registry of every test that shows up on the home page
│   └── test1.json          One test's full content (sample data included)
├── audio/
│   └── test1/
│       ├── section1.mp3    Replace these four with your real recordings
│       ├── section2.mp3
│       ├── section3.mp3
│       └── section4.mp3
└── images/
    └── test1/
        └── map-section2.svg   Sample diagram for a map-labelling question
```

To add **Test 2**, duplicate the pattern: `audio/test2/`, `images/test2/`
(only if that test needs a diagram), `data/test2.json`, then add a line to
`data/tests-manifest.json`.

## Running it locally

Browsers block `fetch()` of local JSON files opened as `file://`, so don't
just double-click `index.html`. From inside the project folder, run either:

```
python3 -m http.server 8000
```

or, if you have Node:

```
npx serve .
```

Then open `http://localhost:8000`. On GitHub Pages this restriction doesn't
apply — it works as soon as it's published.

## Publishing on GitHub Pages

Push the whole folder to your repo, then in **Settings → Pages** set the
source to the branch/folder containing these files. No build step is
needed.

## Replacing the sample content with your own test

The included `test1.json` is placeholder content with **silent audio
files** — it exists so you can see the full flow working (timing,
locked playback, scoring, results) before you plug in a real recording.
Replace it section by section:

1. **Audio** — drop your four MP3s into `audio/test1/` using the same
   file names, or update the `"audio"` path in the JSON if you rename them.
2. **Questions** — edit `data/test1.json`. Each section has an array of
   questions; each question needs a `type` (see below), a `label`, and
   the correct `answer`.
3. **Diagram (if used)** — replace `images/test1/map-section2.svg` with
   your own image (PNG, JPG or SVG all work) and update the letter
   answers in the matching questions if the layout changes.

### Question types

**`fill_blank`** — note/summary completion.
```json
{ "id": 1, "type": "fill_blank", "label": "Customer's surname:", "answer": ["Whitfield"] }
```
`answer` is a list — include spelling variants or acceptable alternatives
you want marked correct.

**`mcq`** — single-answer multiple choice.
```json
{ "id": 6, "type": "mcq", "label": "What time does the pool open?",
  "options": ["6:00 am", "6:30 am", "7:00 am"], "answer": 1 }
```
`answer` is the zero-based index of the correct option.

**`mcq_multi`** — "choose TWO/THREE" questions.
```json
{ "id": 26, "type": "mcq_multi", "label": "Which TWO problems does Priya mention?",
  "options": ["Low response rate", "Ambiguous questions", "Missing budget", "Too many participants"],
  "answer": [0, 1] }
```

**`matching`** — match a list of items to a fixed set of options (speakers,
categories, etc.).
```json
{ "id": 21, "type": "matching", "label": "Suggests narrowing the topic further",
  "options": ["A. Priya", "B. Dev", "C. The tutor"], "answer": "C. The tutor" }
```

**`map_label`** — diagram/map labelling. Renders the section's `image`
above the questions, and each question is a dropdown of location letters.
```json
{ "id": 11, "type": "map_label", "label": "Children's playground",
  "options": ["A", "B", "C", "D", "E", "F", "G", "H"], "answer": "C" }
```

Each section also has:
- `title` — shown in the top bar (e.g. "Section 1")
- `context` — one-line description of the scenario, shown above the questions
- `instructions` — the standard IELTS-style instruction line (word limit etc.)
- `audio` — path to the MP3
- `image` — optional, only for sections with a diagram

## Timing

- `GET_READY_SECONDS`, `REVIEW_SECONDS`, and `TOTAL_MINUTES` are set near
  the top of `js/engine.js` if you want to adjust the pause before each
  section, the review pause after each section, or the overall countdown
  shown in the top bar.
- Playback cannot be paused, rewound, or fast-forwarded once a section
  starts — this mirrors the real computer-delivered test.

## About the band score

The estimated band on the results page uses a widely published
approximate raw-score-to-band conversion for Listening. IELTS does not
publish the exact scale, and it can shift slightly between test versions,
so treat it as a rough guide for practice rather than a guarantee of a
real test-centre score.
