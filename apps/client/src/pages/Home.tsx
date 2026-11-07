import { Link } from "react-router-dom";
import { authClient } from "../lib/auth-client";

const facts = [
  {
    emoji: "🌳",
    title: "A rose by another name",
    body: "Cherries are the fruit of trees in the genus Prunus, which belongs to the rose family (Rosaceae).",
  },
  {
    emoji: "🍬",
    title: "Sweet and sour",
    body: "Most edible cherries fall into two groups: sweet cherries (Prunus avium) and sour cherries (Prunus cerasus).",
  },
  {
    emoji: "🌸",
    title: "Blossom season",
    body: "Cherry blossoms, or sakura, are celebrated in Japan as a symbol of renewal, and hanami picnics date back centuries.",
  },
  {
    emoji: "🗓️",
    title: "A short season",
    body: "Fresh cherries are a late-spring to early-summer treat. Their peak season is short, which makes them feel special.",
  },
  {
    emoji: "💪",
    title: "Small but mighty",
    body: "Cherries provide vitamin C, fiber, potassium, and antioxidant compounds such as anthocyanins.",
  },
  {
    emoji: "😴",
    title: "Nature's nightcap",
    body: "Tart cherries are one of the few foods that naturally contain melatonin, a hormone linked to sleep.",
  },
  {
    emoji: "🌍",
    title: "Grown around the world",
    body: "Turkey, the United States, Chile, and Uzbekistan are among the largest cherry-producing countries.",
  },
  {
    emoji: "🍒",
    title: "The emoji",
    body: "The cherry emoji (🍒) is Unicode U+1F352, added in 2010 as part of Unicode 6.0.",
  },
];

export default function Home() {
  const session = authClient.useSession();

  return (
    <>
      <section className="home-hero">
        <p className="eyebrow">Welcome to cherry-bot</p>
        <h1>
          <span aria-hidden="true">🍒</span> A calmer little AI workspace.
        </h1>
        <p className="home-hero-text">
          cherry-bot is a small, private space with a soft spot for cherries.
          Log how you feel in Cherry Health, keep the answers worth remembering
          in Cherry Responses, and enjoy a few cherry facts along the way.
        </p>
        <div className="home-hero-actions">
          {session.data ? (
            <span className="welcome-pill">
              🍒 Signed in as <strong>{session.data.user.email}</strong>
            </span>
          ) : (
            <>
              <Link to="/signup" className="app-btn">
                Create an account
              </Link>
              <Link to="/login" className="app-btn app-btn-ghost">
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="apps" aria-labelledby="apps-heading">
        <div className="apps-heading">
          <h2 id="apps-heading">Your apps</h2>
          <p>Two small tools, both private to your account.</p>
        </div>

        <div className="apps-grid">
          <Link to="/health" className="app-card">
            <span className="app-card-icon" aria-hidden="true">
              🌿
            </span>
            <span className="app-card-body">
              <span className="app-card-title">Cherry Health</span>
              <span className="app-card-description">
                Describe how you feel, confirm a symptom checklist, and track
                patterns over time.
              </span>
            </span>
            <span className="app-card-arrow" aria-hidden="true">
              →
            </span>
          </Link>

          <Link to="/responses" className="app-card">
            <span className="app-card-icon" aria-hidden="true">
              💬
            </span>
            <span className="app-card-body">
              <span className="app-card-title">Cherry Responses</span>
              <span className="app-card-description">
                Save useful AI responses, organize them with tags, and keep
                notes alongside them.
              </span>
            </span>
            <span className="app-card-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        </div>
      </section>

      <section className="facts" aria-labelledby="facts-heading">
        <h2 id="facts-heading">Cherry facts</h2>
        <div className="facts-grid">
          {facts.map((fact) => (
            <article key={fact.title} className="fact-card">
              <h3>
                <span className="fact-emoji" aria-hidden="true">
                  {fact.emoji}
                </span>
                {fact.title}
              </h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
