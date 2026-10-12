# NextStep Launchpad

Create the NextStep app shell in React + TypeScript + Tailwind.

Product: an executive-function coach for college students with ADHD. Do NOT build any

feature yet — only the shell and design system.

Design tokens (use exactly):

  --bg #F6F7F9, --surface #FFFFFF, --ink #0F172A, --muted #64748B,

  --border #E4E8EE, --primary #4F46E5, --green #15803D,

  --amber #B45309, --red #B91C1C, radius 16px, system font stack.

Build:

- Top bar: square logo tile with "N" (indigo gradient), title "NextStep",

  subtitle "Executive-function coach".

- Segmented nav with five tabs: Map, Execute, Running behind, Connect, Settings.

- Right side: a connection status pill and a user avatar circle.

- A centered content container (max width ~1240px).

- Mobile responsive: stack the layout under 1000px.

Each tab shows a placeholder panel for now. Keep components in src/components/.

Do not add data, state management, or backend calls.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ec10686a-52e1-40f1-82f9-1d0eef79d823).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
