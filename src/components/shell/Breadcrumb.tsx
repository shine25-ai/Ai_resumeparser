import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { menuFor, trailFor, type NavUser } from "./navigation";

const readUser = (): NavUser | null => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

/** Home > Companies > Create Company, above each page's title (as in the mockups). Hidden on the dashboard. */
export default function Breadcrumb() {
  const { pathname, search } = useLocation();
  const items = useMemo(() => menuFor(readUser()), []);
  const trail = trailFor(items, pathname, search);
  if (pathname === "/" || trail.length === 0) return null;
  const parentPath = items.find((i) => i.label === trail[0])?.path;
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-[13px] text-slate-500">
      <Link to="/" className="hover:text-slate-900" aria-label="Home">
        <Home size={14} />
      </Link>
      {trail.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <ChevronRight size={13} className="text-slate-300" />
          {i < trail.length - 1 && parentPath ? (
            <Link to={parentPath} className="hover:text-slate-900">{label}</Link>
          ) : (
            <span className={i === trail.length - 1 ? "font-semibold text-slate-900" : ""}>{label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
