import { createFileRoute } from "@tanstack/react-router";
import { NextStepShell } from "@/components/nextstep-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NextStep — Executive-function coach" },
      { name: "description", content: "NextStep, an executive-function coach for college students with ADHD." },
      { property: "og:title", content: "NextStep — Executive-function coach" },
      { property: "og:description", content: "An executive-function coach for college students with ADHD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NextStepShell,
});
