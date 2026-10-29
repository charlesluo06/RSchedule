import { useEffect, useState } from "react";

// useState that mirrors its value into localStorage, so a refresh doesn't wipe
// the student's setup. The `validate` guard exists because stored JSON is
// untrusted input (old app versions, hand-edited, corrupted) — anything that
// fails it falls back to the default instead of crashing the app on load.
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  validate: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked (private mode) — persistence is best-effort.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
