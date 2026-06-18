// =============================================================================
// Nav.jsx
//
// Renders siteConfig.nav as a single horizontal (scrollable) bar of links and
// dropdown groups.
//
// Why this shape:
//   • The nav tree in siteConfig has exactly two node kinds: leaves (a direct
//     route) and groups (a label with child leaves).
//   • Leaves use <NavLink> so the active route gets the .is-active class for
//     free; styling lives in index.css.
//   • Groups are React-controlled dropdowns: the nav row is a horizontal-scroll
//     container (overflow-x:auto), which clips anything overflowing vertically
//     — so a native <details> menu would be cut off. Instead each group renders
//     its sublist as a position:fixed overlay placed under the button via
//     getBoundingClientRect(), escaping the scroll container. It closes on
//     outside click, Escape, child selection, and route change.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { siteConfig } from "../config/siteConfig.js";

export default function Nav() {
  return (
    <nav className="shell-nav" aria-label="Primary">
      <ul className="shell-nav-list">
        {siteConfig.nav.map((item) =>
          item.kind === "group" ? (
            <NavGroup key={item.label} group={item} />
          ) : (
            <NavLeaf key={item.label} leaf={item} />
          )
        )}
      </ul>
    </nav>
  );
}

// One direct link. `onSelect` (passed for dropdown children) lets the parent
// group close itself when a child is clicked; top-level leaves omit it.
function NavLeaf({ leaf, onSelect }) {
  return (
    <li className="shell-nav-item">
      <NavLink
        to={leaf.to}
        end={leaf.to === "/"}
        className="shell-nav-link"
        onClick={onSelect}
      >
        {leaf.label}
      </NavLink>
    </li>
  );
}

// One top-level group. Its sublist renders as a position:fixed overlay anchored
// under the button, so the nav row's overflow-x scroll container can't clip it.
function NavGroup({ group }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const summaryRef = useRef(null);
  const location = useLocation();

  // Highlight the group label when the current route is one of its children —
  // works whether the dropdown is open or closed (the children aren't in the
  // DOM when closed, so a CSS :has() can't do this).
  const isGroupActive = group.children.some(
    (child) => location.pathname.startsWith(child.to)
  );

  function toggle() {
    if (!open && summaryRef.current) {
      const r = summaryRef.current.getBoundingClientRect();
      setPos({ top: r.bottom, left: r.left });
    }
    setOpen((o) => !o);
  }

  // While open, close on a click outside this item or on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!summaryRef.current?.closest("li")?.contains(e.target)) setOpen(false);
    };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Close on route change (e.g. navigating via something other than a child).
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <li className="shell-nav-item shell-nav-item-group">
      <button
        ref={summaryRef}
        type="button"
        className={`shell-nav-link shell-nav-summary${isGroupActive ? " is-active" : ""}`}
        onClick={toggle}
        aria-expanded={open}
      >
        {group.label}
      </button>
      {open && (
        <ul
          className="shell-nav-sublist"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 500 }}
        >
          {group.children.map((child) => (
            <NavLeaf key={child.label} leaf={child} onSelect={() => setOpen(false)} />
          ))}
        </ul>
      )}
    </li>
  );
}
