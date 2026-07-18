import app from "./app.js";

// Local dev / traditional hosting entry point. Vercel deployment uses
// api/index.ts instead, which imports the same app and never calls listen()
// — Vercel's Node runtime invokes the exported handler directly per request.
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
