// Written narrative for the NextStep security PDF.
// The generator (scripts/build-security-pdf.mjs) reads verdicts, timestamps and
// raw payloads from public/security-results.json; this file holds only prose, so
// regenerating the PDF never rewrites the explanation. Plain object syntax only,
// so Node can load it by stripping types.

export interface CaseProse {
  id: string;
  title: string;
  whatItIs: string;
  whyItMatters: string;
  howTested: string;
  whatHappened: string;
  theFix: string;
  proofLead: string;
  caption: string;
}

export const reportTitle = "NextStep security and robustness report";
export const reportSubtitle =
  "What we attacked, what happened, and what changed — written for readers who do not write code.";

export const inOnePage = [
  "We tried to break NextStep in six different ways, the same way a curious or hostile person might. We tried to use its private features without signing in, to read another student's coursework, to sneak harmful code into names and titles, to point the Moodle connection at places it should never reach, to hammer the sign-in page with guesses, and to overload the app with extreme input.",
  "Three of the six attacks found nothing to exploit on the first try. Two exposed real weak spots: the Moodle connection accepted dangerous addresses, and pressing Done many times quickly could record the same step twice. One test was itself faulty and reported a problem that did not exist. Each weak spot was fixed with a small, targeted change, and every attack was then run again.",
  "On the final run all six attacks were stopped. For a single-student app on demo data, NextStep is safe to use now, within the limits described at the end of this report.",
];

export const glossary: Array<[string, string]> = [
  ["Attack surface", "Any doorway into the app that an outsider can knock on, such as a sign-in form, a web address or a button."],
  ["Payload", "The exact thing an attacker sends through that doorway, such as a booby-trapped name or a fake password."],
  ["Anon key", "A public pass that lets the app talk to its database at all; it proves which app is calling, not which person."],
  ["Row-level security", "A database rule that checks every single record and hands it only to the account that owns it."],
  ["Unauthenticated request", "A message to the server that arrives without proof of who is sending it, like a letter with no signature."],
  ["Verification", "Running the same attack again after a fix and recording, with a timestamp, that it now fails."],
];

export const methodIntro =
  "Every case followed the same six steps, so the results can be compared fairly. In plain words:";
export const methodSteps = [
  "List the doorway being attacked and decide what 'safe' should look like before touching it.",
  "Prepare a harmless, repeatable test input. No real Moodle site, real coursework or AI service is used.",
  "Send the attack and write down exactly what came back, without ever recording passwords or tokens.",
  "Compare the answer with what 'safe' was supposed to look like.",
  "If the attack worked, make the smallest change that closes the gap.",
  "Run the identical attack again and only call it fixed once it is stopped and timestamped.",
];
export const methodScope =
  "Scope: the NextStep web app, its sign-in system, its database rules and the three small server programs that talk to Moodle and the AI planner. The owner, Audrie Hana Lee Bey, is the only authorised tester, and a second throwaway account she created played the role of 'another student'.";

export const cases: CaseProse[] = [
  {
    id: "S1",
    title: "Using a private feature without signing in",
    whatItIs:
      "Imagine walking up to a bank teller and asking to open a vault without showing any ID. Technically, we sent a request to the server program that connects a student's Moodle account, but left out the sign-in proof that normally travels with it.",
    whyItMatters:
      "That program stores a student's Moodle access key in the database. If it ran for strangers, anyone on the internet could attach their own Moodle account to someone else's NextStep, plant fake courses, or use our server as a free relay to probe Moodle sites. The student would see a plan that was not theirs and would have no idea why.",
    howTested:
      "The attacker controls everything about the message except a valid sign-in. We sent one connection request carrying only the app's public pass, a made-up Moodle address that cannot exist, and a fake access key. We deliberately left out the signed-in session. We then read the reply the server gave back and checked that no call to Moodle followed.",
    whatHappened:
      "The attack failed. The server refused straight away with the standard 'you are not signed in' answer and did not contact Moodle or touch the database. This is the behaviour we wanted, so the first run already counted as a pass.",
    theFix:
      "No change was needed. The program was already written to check for a signed-in student before doing anything else, which is the right order: identity first, work second. In technical terms, the function verifies the user's session token and returns HTTP 401 when it is absent.",
    proofLead: "The same anonymous request was sent on the final run.",
    caption: "Figure 1 — the server refuses a request with no sign-in.",
  },
  {
    id: "S2",
    title: "Reading another student's coursework",
    whatItIs:
      "Think of a shared filing cabinet where you try opening a drawer labelled with a classmate's name. Technically, a fully signed-in second account asked the database directly for the first account's assignments, steps and courses, using their real record numbers.",
    whyItMatters:
      "NextStep holds deadlines, course names and notes about how a student with ADHD is coping. If one account could read another's, a stranger could learn someone's schedule and workload, and could even copy record numbers to tamper with their plan. Privacy here is not optional; it is the core promise of the app.",
    howTested:
      "This attacker is more dangerous than the one in S1 because they hold a genuine sign-in. The owner created a second throwaway account and gave us its short-lived session. We looked up the owner's real account number and one real assignment number. We then asked the database, as the second account, for every assignment, step and course belonging to the owner.",
    whatHappened:
      "The attack failed. The database accepted the question as perfectly normal but answered with nothing at all for all three kinds of record. It did not reveal that the records exist, which also avoids leaking hints.",
    theFix:
      "No change was needed. Every table already carries a rule that compares each record's owner with the person asking, and silently leaves out anything that does not match. That rule is called row-level security, and because it lives inside the database, it applies even if the app itself had a bug.",
    proofLead: "The cross-account read was run with the second account's real session.",
    caption: "Figure 2 — another account sees zero of the owner's records.",
  },
  {
    id: "S3",
    title: "Hiding harmful code inside a name",
    whatItIs:
      "It is like writing a sticky note that, when someone reads it aloud, makes them hand over their keys. Technically, we stored a display name and an assignment title containing a fragment of web code that tries to run a script when shown on screen.",
    whyItMatters:
      "If the app treated that text as code instead of words, the script would run inside the student's own browser while they were signed in. It could read their plan, change settings or quietly send data elsewhere. Because Moodle titles come from outside NextStep, an instructor's typo or a malicious course could carry this kind of trap in.",
    howTested:
      "The attacker controls the text of a name or title. We placed the booby-trapped text into both a profile name and an assignment title, then drew the account area and the Map the same way the real app does. Finally we searched the finished page for any live image element or script trigger rather than plain characters.",
    whatHappened:
      "The attack failed: the text appeared on screen as harmless visible characters. However, our first run wrongly reported a problem, because the checker spotted the words of the trap and mistook them for working code. The weakness was in the test, not the app.",
    theFix:
      "We corrected the checker so it tells the difference between text that merely looks like code and code that would actually run. The app itself needed nothing, because the screen-drawing library it uses, React, automatically treats every name and title as plain text, a safeguard called output escaping.",
    proofLead: "The corrected check was re-run against both fields.",
    caption: "Figure 3 — the trap appears as plain text, not code.",
  },
  {
    id: "S4",
    title: "Pointing the Moodle connection somewhere dangerous",
    whatItIs:
      "Picture asking a courier to collect a parcel from 'my school' but writing the address of the courier company's own back office. Technically, we gave the Moodle connection form addresses that point at the server's private internals, local files, or browser scripts instead of a real Moodle site.",
    whyItMatters:
      "The server, not the student's browser, makes the trip to Moodle. A trick address could make it fetch private cloud settings, internal passwords or local files and hand the reply back to the attacker. This is a common way real services get breached, so the address must be checked before the server ever goes anywhere.",
    howTested:
      "The attacker controls the website address and the access key typed into the connection form. We tried four bad inputs: an address used inside cloud servers for secret settings, a request for a file on the server's own disk, a browser script disguised as an address, and an absurdly long key. We also sent one ordinary, valid school address as a control, and counted every outbound trip the server tried to make.",
    whatHappened:
      "On the first run the attack worked: the program did not reject these addresses before setting off. This was a genuine weakness and the case was marked vulnerable.",
    theFix:
      "We added a gatekeeper that inspects the address first. It now only allows secure web addresses, refuses private and internal locations, caps the key's length, and refuses to be quietly redirected elsewhere. Only after passing that gate does the server contact Moodle. This defence is known as server-side request forgery protection.",
    proofLead: "All four bad inputs and the valid control were sent again.",
    caption: "Figure 4 — every dangerous address stops at the gate.",
  },
  {
    id: "S5",
    title: "Guessing passwords and forging sign-ins",
    whatItIs:
      "It is like trying every key on a big ring until one opens the door, or showing a badge you printed yourself. Technically, we sent broken sign-in renewals, a forged identity badge and a rapid burst of wrong passwords to the sign-in service.",
    whyItMatters:
      "If unlimited guesses were allowed, a weak password would eventually fall and the attacker would own the student's account. If forged badges were accepted, no password would be needed at all. A crash under this pressure would also be a problem, because it could lock real students out.",
    howTested:
      "The attacker controls the email, the password and any token they present, but has no real credentials. We asked to renew a session without the app's public pass, presented a badge that was deliberately malformed, and then fired thirty-five wrong-password attempts in quick succession. The owner's screenshot of the sign-in settings showed the allowance was thirty attempts per five minutes, so we sent more than that on purpose.",
    whatHappened:
      "The attack failed. Every forged or incomplete request was turned away. The first thirty password guesses were refused as wrong, and the remaining five were refused with a 'slow down' answer. Nothing caused the service to crash or return an internal error.",
    theFix:
      "No change to the app was needed. The sign-in service, run by Supabase, already limits how often anyone can try, which is called rate limiting. The only adjustment was to our own test, which originally sent fewer attempts than the limit and so could never prove the limit worked.",
    proofLead: "The thirty-five-attempt burst and both forged requests were repeated.",
    caption: "Figure 5 — rapid guesses are slowed and then refused.",
  },
  {
    id: "S6",
    title: "Overloading the app with extreme input",
    whatItIs:
      "This is less a burglar and more a toddler pressing every button at once. Technically, we fed the app an enormous title, an assignment with two hundred steps, and fifty presses of the Done button on a single step.",
    whyItMatters:
      "For a student with ADHD, a frozen screen or a progress bar that jumps to 140 percent breaks trust in the coach instantly. Worse, if one step were saved as finished several times, NextStep's calibration would learn wrong lessons about how fast the student works, and every future estimate would drift.",
    howTested:
      "The attacker controls the size and timing of input, not the code. We drew a title five thousand characters long, calculated progress for a two hundred step assignment at the start, middle and end, and pressed Done fifty times in a row as fast as possible. We then counted how many times the step was actually saved.",
    whatHappened:
      "On the first run the long title and progress maths were fine, but the rapid presses got through more than once. The case was marked vulnerable, because repeated saves could corrupt both the progress record and the student's pace data.",
    theFix:
      "We made finishing a step a one-time event. The first press now claims the step; every later press for the same step is politely ignored, and the database is only written to after that claim succeeds. Developers call this making the action idempotent, meaning doing it twice has the same effect as doing it once.",
    proofLead: "The fifty-press burst and long-input checks were run again.",
    caption: "Figure 6 — fifty presses produce exactly one saved result.",
  },
];

export const notProven =
  "This report shows that six specific attacks fail against this build, on demo data, at the times recorded. It does not prove the app is safe against every possible attack. The cross-account test used one throwaway account and one real assignment, not every table and every combination of records. The sign-in limit belongs to Supabase and could change if its settings change. The Moodle address gate checks addresses as typed; a domain that later changes where it points still relies on the hosting platform's own network controls. Screen and timer behaviour was tested in one browser, not every device, screen size or assistive tool. No real Moodle site and no AI service were used, so faults that only appear with live data are outside this report. Each of these needs a fresh, manual check whenever the app, its settings or its hosting change.";
