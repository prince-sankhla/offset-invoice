# Trace — Invoice Review

A compact invoice-review workspace built for the Offset frontend assignment. The interface keeps the source document beside its extracted values so a reviewer can inspect a value, correct it, approve or reject it, and see the resulting audit event.

## What it demonstrates

- PDF and image upload with type and 15 MB size validation
- In-browser PDF rendering with page navigation
- Source highlights linked to selectable fields
- Edit, approve and reject actions with explicit field states
- A session audit trail containing the previous value, new value, action, reviewer and timestamp
- Manual field creation by drawing a box over the source page
- A responsive two-panel review layout, empty states, validation feedback and keyboard-accessible controls
- Tests for coordinate normalization, review state transitions and audit events

## Run it

Requires Node.js 22.6 or newer and npm.

```bash
npm install
npm run dev
```

Open the local address printed by Vite. A fictional sample invoice loads on first visit, so the review interactions can be tried without uploading a file.

## Verify before deploying

```bash
npm test
npm run build
npm run preview
```

The test suite uses Node's built-in test runner and type stripping; no browser test framework is required for the model tests. The production build also runs TypeScript's strict project checks before Vite bundles the app.

## Implementation notes

- `src/features/invoice-review/model.ts` owns the review types, mock values, normalized source boxes and pure reducer. Review actions receive IDs and timestamps from the UI layer so the state transitions remain deterministic and testable.
- `DocumentViewer.tsx` owns PDF lifecycle, page rendering, source overlays and manual box drawing.
- `FieldReviewPanel.tsx` owns field editing and status actions; `ActivityLog.tsx` renders the immutable event list.
- Source boxes are stored as normalized page-relative coordinates. The supplied mock values use the assignment's coordinates in a 720 × 900 design space, then normalize them so overlays scale with the rendered page.
- PDF and image files are processed in the browser. The app does not upload documents or call an OCR service.
- Extracted values are fixture data, not OCR output. On an arbitrary uploaded document, the reviewer should verify the values and can draw a box to map a value back to its source.

## Deployment

1. Push the repository to GitHub.
2. Import `prince-sankhla/offset-invoice` into Vercel with the Vite preset.
3. Keep the build command as `npm run build` and the output directory as `dist`.
4. Open the production URL in a private browser window. Try the sample flow and a small PDF before recording the walkthrough.

## Walkthrough checklist

In a video under two minutes, show: the default sample invoice; selecting a field and seeing its source highlight; editing and approving a value; the change history; uploading a PDF; drawing a manual field; and one trade-off you would improve with more time.

## Scope

This is a frontend assignment prototype, not a production document-processing service. Authentication, roles, persistence, OCR and backend APIs are intentionally out of scope for this small task.
