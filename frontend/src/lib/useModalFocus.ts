import { useEffect, useRef } from "react";

// Moves keyboard focus into a modal when it opens and puts it back on
// whatever opened it when it closes. Without this, focus stays on the page
// behind the backdrop, so a keyboard or screen-reader user tabs through
// controls they can't see. Attach the returned ref to the role="dialog" element.
export function useModalFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => opener?.focus();
  }, []);

  return ref;
}
