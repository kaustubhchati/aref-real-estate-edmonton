// =============================================================================
// Nav.jsx
//
// Renders siteConfig.nav as a horizontal bar of links and dropdown groups.
//
// Why this shape:
//   • The nav tree in siteConfig has exactly two node kinds: leaves (a direct
//     route) and groups (a label with child leaves). Anything more elaborate
//     would be over-engineering for what is a fixed nav from CLAUDE.md §6.
//   • Groups use native <details>/<summary> so the dropdown works with zero
//     React state, zero JS — keyboard- and screen-reader-friendly out of the
//     box. Olivia can read this without learning useState first.
//   • Leaves use <NavLink> so the active route gets the .is-active class for
//     free; styling lives in index.css.
// =============================================================================

import { NavLink } from "react-router-dom";
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

// One top-level direct link (Home, About, Download, …).
function NavLeaf({ leaf }) {
  return (
    <li className="shell-nav-item">
      <NavLink to={leaf.to} end={leaf.to === "/"} className="shell-nav-link">
        {leaf.label}
      </NavLink>
    </li>
  );
}

// One top-level group whose children expand from a <details> dropdown.
// We do NOT close-on-route-change here on purpose — keeping the menu open
// after a click is a small detail that matters less than legible code.
function NavGroup({ group }) {
  return (
    <li className="shell-nav-item shell-nav-item-group">
      <details className="shell-nav-group">
        <summary className="shell-nav-link shell-nav-summary">
          {group.label}
        </summary>
        <ul className="shell-nav-sublist">
          {group.children.map((child) => (
            <NavLeaf key={child.label} leaf={child} />
          ))}
        </ul>
      </details>
    </li>
  );
}
