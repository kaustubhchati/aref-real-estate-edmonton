// =============================================================================
// Feedback.jsx  (Directive 06)
//
// A contact form + an aside. The site has no server/API (CLAUDE.md §1), so the
// form opens a pre-filled email to siteConfig.contact via mailto instead of
// POSTing anywhere. (siteConfig.contact is a PLACEHOLDER pending the real inbox;
// a hosted form service is the alternative — Directive 00, Decision 5.)
// Prose transcribed from the approved prototype; identity from siteConfig.
// =============================================================================

import { useState } from "react";
import { siteConfig } from "../../config/siteConfig.js";
import PearlBand from "../../components/PearlBand.jsx";
import Icon from "../../components/Icon.jsx";

const TOPICS = [
  { value: "general", label: "General feedback" },
  { value: "data", label: "A correction to the data" },
  { value: "dataset", label: "Suggest a dataset" },
  { value: "competition", label: "Research competition" },
];

export default function Feedback() {
  const [sent, setSent] = useState(false);
  const { dept, org, contact } = siteConfig;

  function handleSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = form.querySelector("#fb-name").value;
    const email = form.querySelector("#fb-email").value;
    const topicSelect = form.querySelector("#fb-topic");
    const topic = topicSelect.options[topicSelect.selectedIndex].text;
    const message = form.querySelector("#fb-msg").value;
    // No backend: open a pre-filled email to the contact inbox.
    const subject = encodeURIComponent(`Feedback: ${topic}`);
    const body = encodeURIComponent(`${message}\n\nFrom: ${name} (${email})`);
    window.location.href = `mailto:${contact}?subject=${subject}&body=${body}`;
    setSent(true);
  }

  return (
    <div className="readpage brand">
      <section className="pagehero">
        <PearlBand variant="hero">
          <div className="wrap">
            <div className="pagehero__inner">
              <div className="pagehero__rule" />
              <p className="pagehero__eyebrow">Feedback</p>
              <h1 className="pagehero__title">Send Us Feedback</h1>
              <p className="pagehero__sub">
                Spotted something off in the data, or want to suggest a dataset? Tell us.
              </p>
            </div>
          </div>
        </PearlBand>
      </section>

      <section className="pagebody">
        <div className="wrap">
          <div className="fb">
            {sent ? (
              <div className="fb__thanks">
                <span className="fb__check"><Icon name="check" size={22} /></span>
                <div>
                  <h3>Thanks for Reaching Out</h3>
                  <p>
                    Your message should open in your email app. Send it there and we will
                    follow up if a reply is needed.
                  </p>
                </div>
              </div>
            ) : (
              <form className="fb__form" onSubmit={handleSubmit}>
                <div className="fb__field">
                  <label htmlFor="fb-name">Name</label>
                  <input id="fb-name" type="text" placeholder="Your name" required />
                </div>
                <div className="fb__field">
                  <label htmlFor="fb-email">Email</label>
                  <input id="fb-email" type="email" placeholder="name@example.com" required />
                </div>
                <div className="fb__field">
                  <label htmlFor="fb-topic">Topic</label>
                  <select id="fb-topic" defaultValue="general">
                    {TOPICS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="fb__field">
                  <label htmlFor="fb-msg">Message</label>
                  <textarea id="fb-msg" rows={5} placeholder="What's on your mind?" required />
                </div>
                <button type="submit" className="btn btn--solid fb__submit">Send Feedback</button>
              </form>
            )}

            <aside className="fb__aside">
              <h3 className="fb__aside-h">Other Ways to Reach Us</h3>
              <p className="fb__aside-p">
                Maintained by the {dept}, {org}. For questions about the data or the research
                competition, use the form and choose a topic.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
