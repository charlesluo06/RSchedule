// Shown while the app is fetching the live term list for the first time.
// Two stacked copies of the same logo: a grayed-out base (always visible)
// and a full-color copy clipped to only reveal its bottom portion, with
// that reveal animating upward — a "filling up" loading effect rather than
// a generic spinner.
function BootScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-linear-to-b from-neutral-50 to-neutral-100">
      <div className="relative h-64 w-64">
        <img src="/logo.png" alt="" className="absolute inset-0 h-full w-full object-contain opacity-25 grayscale" />
        <img
          src="/logo.png"
          alt="RSchedule"
          className="animate-logo-fill absolute inset-0 h-full w-full object-contain"
        />
      </div>
    </div>
  );
}

export default BootScreen;
