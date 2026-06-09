import type { InputHTMLAttributes } from "react";
import { Search } from "lucide-react";

type SearchFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
  inputClassName?: string;
};

export function SearchField({ wrapperClassName = "", inputClassName = "", type = "search", ...props }: SearchFieldProps) {
  return (
    <label className={`relative block ${wrapperClassName}`.trim()}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim" />
      <input type={type} className={`w-full !pl-11 ${inputClassName}`.trim()} {...props} />
    </label>
  );
}