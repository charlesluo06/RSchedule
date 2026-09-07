// Nightly cache warm-up for the course-code autocomplete.
//
// Autofill is only fast once someone has already searched a given subject
// recently — the first person to search it in a fresh cache window pays
// UCR's full live handshake+search latency (~1-4s), and everyone after
// them gets an instant cache hit. This script exists so a REAL USER is
// never the one who has to go first: it fetches every subject's course
// list ahead of time and writes it into the exact same Redis cache the app
// already reads from, using the exact same cache-or-fetch service
// functions — so there's no new code path, just a scheduled trigger for
// the existing one.
//
// Deliberately scoped to ONLY the lightweight, stable autofill data
// (subjects + course-codes) — never bundles/seats, which must stay
// reactive so seat counts are never a stale overnight snapshot.
//
// Run with: npx tsx scripts/warmCache.ts
import "dotenv/config";
import { fetchTerms } from "../src/services/ucrClient.js";
import { getSubjects, getCourseCodesForSubject } from "../src/services/courseService.js";

// Matches the frontend's own term filter (App.tsx) as a base, plus
// excluding "(View Only)" terms — those are closed for registration, so
// nobody's actually running autofill against them; warming them would just
// be UCR traffic spent on a term nobody can search.
function isRelevantTerm(term: { code: string; description: string }): boolean {
  return Number(term.code.slice(0, 4)) >= 2026 && !term.description.includes("View Only");
}

async function warmTerm(termCode: string, description: string) {
  console.log(`\n=== ${description} (${termCode}) ===`);
  const subjects = await getSubjects(termCode);
  console.log(`  ${subjects.length} subjects`);

  let warmed = 0;
  let failed = 0;
  for (const subject of subjects) {
    try {
      await getCourseCodesForSubject(subject.code, termCode);
      warmed++;
    } catch (err) {
      failed++;
      console.warn(`  Failed to warm ${subject.code}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`  Warmed ${warmed}/${subjects.length} subjects${failed > 0 ? ` (${failed} failed)` : ""}`);
}

async function main() {
  const start = performance.now();
  const terms = await fetchTerms();
  const relevantTerms = terms.filter(isRelevantTerm);
  console.log(`Found ${terms.length} terms, warming ${relevantTerms.length} of them.`);

  for (const term of relevantTerms) {
    await warmTerm(term.code, term.description);
  }

  const totalSeconds = (performance.now() - start) / 1000;
  console.log(`\nDone in ${totalSeconds.toFixed(1)}s.`);
}

main().catch((err) => {
  console.error("Cache warm-up failed:", err);
  process.exit(1);
});
