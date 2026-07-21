// =============================================================================
// Drawer.jsx  (Home/Header batch)
//
// The off-canvas navigation drawer: a LEFT slide-over the hamburger in Header
// opens. It REPLACES the old horizontal nav bar (Nav.jsx, retired) as the site's
// single navigation surface, on every screen size. Contract:
//   • Slides in from the left over a dark scrim; scrim + panel live above ALL
//     other chrome (z-index above the header + portaled menus — see index.css).
//   • Closes three ways: the X button, a click on the scrim, or Escape.
//   • Renders siteConfig.nav in full — groups as labelled sections (icon + label)
//     with their pages listed beneath, top-level pages as plain links. The active
//     route is marked via NavLink (`end` on Home so "/" only matches exactly).
//   • Accessible: role="dialog" aria-modal, focus moves into the panel on open
//     and returns to the trigger on close, Tab is trapped inside, Escape exits,
//     and background scroll is locked while open. When closed the whole overlay
//     is `inert` (+ aria-hidden), so its controls are never focusable or reachable
//     by assistive tech even during the slide-out (the visibility timing is only
//     for the visual close).
//
// Motion is transform/opacity only and reduced-motion-safe (the global
// prefers-reduced-motion rule collapses the slide to an instant show/hide).
// =============================================================================

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import { siteConfig } from "../config/siteConfig.js";
import Icon from "../components/Icon.jsx";

// A live/soon badge, shown beside a page link that carries a status.
function StatusDot({ status }) {
  if (!status) return null;
  return (
    <span className={`drawer__dot drawer__dot--${status}`}>
      {status === "live" ? "Live" : "Soon"}
    </span>
  );
}

// `triggerRef` is the hamburger button (Header) — focus returns to it on close.
export default function Drawer({ id, open, onClose, triggerRef }) {
  const panelRef = useRef(null);

  // === Open lifecycle: focus-in, focus-trap, Escape, scroll-lock, focus-return ==
  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    // Capture the trigger now (the hamburger is stable while the drawer is open)
    // so focus can return to it on close.
    const trigger = triggerRef?.current;

    // Move focus into the drawer (the close button is the first stop).
    panel?.querySelector(".drawer__close")?.focus();

    function onKeyDown(e) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Trap Tab within the panel so keyboard focus can't wander behind the scrim.
      if (e.key === "Tab") {
        const items = panel.querySelectorAll("a[href], button:not([disabled])");
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    // Lock background scroll while the drawer is open; restore the prior value on close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open, onClose, triggerRef]);

  // Portaled to <body> so the panel's z-index isn't trapped inside the header's
  // stacking context (the codebase's overlay pattern). `.brand` keeps the header's
  // Roboto + gold accents; the dark-chrome surfaces come from the global :root
  // tokens (--shell / --hair / --tx / --accent-teal), which .brand does not touch.
  // `inert` (React 19 native boolean) makes the closed overlay fully non-interactive
  // and unreachable by focus / assistive tech — it supersedes relying on the CSS
  // visibility timing to pull the links out of the tab order during the close slide.
  return createPortal(
    <div className={`drawer brand${open ? " is-open" : ""}`} inert={!open} aria-hidden={!open}>
      {/* Scrim — click anywhere off the panel to close. */}
      <div className="drawer__scrim" onClick={onClose} />

      <aside
        id={id}
        ref={panelRef}
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
      >
        <div className="drawer__head">
          <span className="drawer__title">Menu</span>
          <button
            type="button"
            className="drawer__close"
            aria-label="Close navigation menu"
            onClick={onClose}
          >
            <Icon name="x" size={22} />
          </button>
        </div>

        <nav className="drawer__nav" aria-label="Primary">
          {siteConfig.nav.map((item) =>
            item.children ? (
              // A category: a labelled section with its pages listed beneath.
              <div className="drawer__group" key={item.label}>
                <p className="drawer__group-label">
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </p>
                {item.children.map((child) => (
                  <NavLink
                    key={child.label}
                    to={child.to}
                    className={({ isActive }) =>
                      `drawer__link drawer__link--sub${isActive ? " is-active" : ""}`
                    }
                    onClick={onClose}
                  >
                    <span>{child.label}</span>
                    <StatusDot status={child.status} />
                  </NavLink>
                ))}
              </div>
            ) : (
              // A top-level page (Home, Report Card, Download, ...).
              <NavLink
                key={item.label}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `drawer__link${isActive ? " is-active" : ""}`}
                onClick={onClose}
              >
                <span>{item.label}</span>
                <StatusDot status={item.status} />
              </NavLink>
            )
          )}
        </nav>
      </aside>
    </div>,
    document.body
  );
}
