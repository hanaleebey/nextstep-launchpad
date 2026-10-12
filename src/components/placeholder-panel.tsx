import type { LucideIcon } from "lucide-react";

export function PlaceholderPanel({ title, icon: Icon }: { title: string; icon: LucideIcon }) {
  return (
    <section className="placeholder-panel" aria-label={`${title} placeholder`}>
      <div className="placeholder-content">
        <div className="placeholder-icon"><Icon size={26} strokeWidth={1.5} aria-hidden="true" /></div>
        <h2>{title}</h2>
        <p>Coming soon</p>
      </div>
    </section>
  );
}