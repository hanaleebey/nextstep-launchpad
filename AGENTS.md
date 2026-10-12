<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## App structure
- Keep the NextStep shell and placeholder panels in `src/components/`, with the index route composing the shell; this separates presentation from routing.
- Use uncontrolled design-system tabs for shell navigation, without app data or backend calls; the shell remains presentation-only.
- Define visual styling and semantic tokens in `src/styles.css`; shared tokens keep the shell consistent.
