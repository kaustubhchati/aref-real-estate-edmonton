// =============================================================================
// Footer.jsx
//
// The institutional footer (Directive 03): a dark pearl-green band carrying the
// territorial acknowledgement, data partners, and open-access sources, then a
// bar of social links, the UAlberta mark, and the copyright. Read pages only —
// the immersive map routes drop the footer (Layout). Every string is read from
// siteConfig; the mark + copyright derive their org text from siteConfig.org.
// =============================================================================

import { siteConfig } from "../config/siteConfig.js";
import PearlBand from "../components/PearlBand.jsx";
import Shield from "../components/Shield.jsx";
import Icon from "../components/Icon.jsx";

export default function Footer() {
  const { footer, org } = siteConfig;
  const [firstWord, ...restWords] = org.split(" ");
  return (
    <footer className="shell-footer brand">
      <PearlBand variant="band">
        <div className="wrap">
          <div className="ftr__grid">
            <div>
              <h2 className="ftr__ack-h">Territorial Acknowledgement</h2>
              <p className="ftr__ack-body">{footer.territorialAck}</p>
            </div>
            <div>
              <h2 className="ftr__col-h">Data Partners</h2>
              <ul className="ftr__list">
                {footer.dataPartners.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
            <div>
              <h2 className="ftr__col-h">Open-Access Sources</h2>
              <ul className="ftr__list">
                {footer.openSources.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </div>

          <hr className="ftr__rule" />

          <div className="ftr__bar">
            <div className="ftr__social">
              {footer.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name={s.icon} size={19} />
                </a>
              ))}
            </div>
            <div className="ftr__mark-wrap">
              <Shield size={34} title={`${org} shield`} />
              <span className="ftr__mark-txt">
                {firstWord}
                <br />
                {restWords.join(" ")}
              </span>
            </div>
            <span className="ftr__copy">© {footer.copyrightYear} {org}</span>
          </div>
        </div>
      </PearlBand>
    </footer>
  );
}
