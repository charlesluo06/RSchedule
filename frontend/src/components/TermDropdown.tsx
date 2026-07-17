import type { Term } from "../types";

interface TermDropdownProps {
  terms: Term[];
  selectedTermCode: string;
  onChange: (code: string) => void;
  loading: boolean;
  error: string | null;
}

function TermDropdown({ terms, selectedTermCode, onChange, loading, error }: TermDropdownProps) {
  if (loading) {
    return <p className="text-sm text-neutral-500">Loading terms…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-primary-700">Term</span>
      <select
        value={selectedTermCode}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer rounded-xl border border-neutral-200 bg-white px-3 py-2 text-neutral-900
                   focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {terms.map((term) => (
          <option key={term.code} value={term.code}>
            {term.description}
          </option>
        ))}
      </select>
    </label>
  );
}

export default TermDropdown;
