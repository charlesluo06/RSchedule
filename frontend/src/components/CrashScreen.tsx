// Shown by the top-level error boundary if the app crashes while rendering,
// instead of leaving the student staring at a blank page.
function CrashScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-neutral-50 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        <span className="text-accent-500">R</span>
        <span className="text-primary-700">Schedule</span>
      </h1>
      <p className="max-w-sm text-neutral-700">Something went wrong. Reloading the page usually fixes it.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="cursor-pointer rounded-xl bg-accent-500 px-5 py-2.5 font-semibold text-primary-900
                   transition-colors hover:bg-accent-600"
      >
        Reload
      </button>
    </div>
  );
}

export default CrashScreen;
