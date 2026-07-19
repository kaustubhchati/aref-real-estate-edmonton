// =============================================================================
// Nav.jsx
//
// The primary navigation bar (Directive 03): the categories + utility pages
// spread full-width edge-to-edge, each category a click-to-open dropdown listing
// its sub-pages with a live/soon badge. Below 1240px the bar collapses to a
// hamburger + in-place accordion. Reads siteConfig.nav; the shared shell
// (Layout) auto-hides this bar on the immersive map routes.
//
// Dropdowns open on CLICK, not hover (Directive 00, Decision 6 — better for
// touch + keyboard). A group closes on outside-click, Escape, or choosing a
// child; clicking another group's button counts as an outside-click on the open
// one, so opening one closes the others.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { siteConfig } from "../config/siteConfig.js";
import Icon from "../components/Icon.jsx";

// A live/soon badge (shown next to dropdown + mobile sub-page links).
function StatusDot({ status }) {
  return (
    <span className={`nav__dot nav__dot--${status}`}>
      {status === "live" ? "Live" : "Soon"}
    </span>
  );
}

// One category: a click-to-open dropdown of its sub-pages. Closes on
// outside-click, Escape, or choosing a child.
function NavGroup({ group }) {
  const [open, setOpen] = useState(false);
  const itemRef = useRef(null);
  const location = useLocation();
  const active = group.children.some((c) => location.pathname.startsWith(c.to));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!itemRef.current?.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <li className={`nav__item${open ? " is-open" : ""}`} ref={itemRef}>
      <button
        type="button"
        className={`nav__link${active ? " nav__link--active" : ""}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {group.label}
        <Icon name="chevron-down" size={14} className="nav__caret" />
      </button>
      <div className="nav__menu" role="menu">
        {group.children.map((child) => (
          <NavLink
            key={child.label}
            to={child.to}
            role="menuitem"
            className="nav__menu-link"
            onClick={() => setOpen(false)}
          >
            <span>{child.label}</span>
            <StatusDot status={child.status} />
          </NavLink>
        ))}
      </div>
    </li>
  );
}

// The <1240px accordion: tap a category to expand its sub-pages in place; tap a
// page to navigate (which closes the whole sheet via onNavigate).
function NavMobile({ onNavigate }) {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="nav__mobile">
      {siteConfig.nav.map((item) =>
        item.children ? (
          <div key={item.label}>
            <button
              type="button"
              className="nav__mobile-link"
              aria-expanded={expanded === item.label}
              onClick={() => setExpanded((g) => (g === item.label ? null : item.label))}
            >
              <span>{item.label}</span>
              <Icon name="chevron-down" size={16} className="nav__caret" />
            </button>
            {expanded === item.label && (
              <div className="nav__mobile-sub">
                {item.children.map((child) => (
                  <NavLink
                    key={child.label}
                    to={child.to}
                    className="nav__mobile-link"
                    onClick={onNavigate}
                  >
                    <span>{child.label}</span>
                    <StatusDot status={child.status} />
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ) : (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.to === "/"}
            className="nav__mobile-link"
            onClick={onNavigate}
          >
            <span>{item.label}</span>
          </NavLink>
        )
      )}
    </div>
  );
}

export default function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav className="shell-nav brand" aria-label="Primary">
      <div className="wrap--full">
        <div className="nav__inner">
          <ul className="nav__list">
            {siteConfig.nav.map((item) =>
              item.children ? (
                <NavGroup key={item.label} group={item} />
              ) : (
                <li className="nav__item" key={item.label}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              )
            )}
          </ul>
          <button
            type="button"
            className="nav__toggle"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <Icon name={mobileOpen ? "x" : "menu-2"} size={22} />
          </button>
        </div>
        {mobileOpen && <NavMobile onNavigate={() => setMobileOpen(false)} />}
      </div>
    </nav>
  );
}
