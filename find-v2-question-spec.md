# /find v2 — Challenge Flow Question Spec

Draft v2. Incorporates the Aug 9 corrections: mechina split, conditions question cut, opener gated, service questions gated, ranking rule, UI requirements.

## Design rules

1. **Same questions for almost everyone.** Two hard filters (program gender, and "still in high school"). Everything else is soft weighting.
2. **The video is conditional, not the question.** One linear sequence; which clip fires depends on the answer.
3. **All options visible always,** each with a one-line reason it exists.
4. **Three question types:**
   - **Filter** — hard narrowing, no argument, no video.
   - **Challenge** — defensible right direction, most kids default wrong. Your face, your position, stated as a position.
   - **Tradeoff** — multiple serious opinions. Filmed as a disagreement, unresolved. You booked them; you don't adjudicate.
5. **Ends where /find ends now** — a filtered program list.

## Ranking rule

Weighted, not eliminating. A program surfaces if it matches roughly three or more filters/tags; more matches ranks higher. **No hard cut on low match count** — the whole premise of this project is that a kid's stated preferences can steer him away from the right program. Cutting the tail reintroduces exactly that failure. Show the weak matches at the bottom rather than hiding them.

Only two things eliminate: program gender, and "still in high school."

## UI requirements

- **Submit** at the end — explicit, not auto-advance on last answer.
- **Skip** on every question. Skipped questions carry no weight; they don't block.
- **Back** to the previous question, preserving answers.

---

## Q1 — Life stage — FILTER (asked first, gates everything)

**"What stage will you be in *when you go*?"**

Not what they are now — a high school junior shopping for next year answers wrong otherwise.

- Still in high school (going during high school)
- Right after high school
- During college — summer or between semesters
- During college — a full semester or year
- After college
- Working / later

**Hard cut:** "still in high school" → summer programs and short trips only.
**Not a cut:** "after college" does *not* remove mechinot.

**Video:** none. Plumbing.

---

## Q2 — Opener — UNIVERSAL VIDEO (conditional on Q1)

**Shown to:** "right after high school," "after college," "working / later."
**Not shown to:** "still in high school," or either during-college answer. The argument doesn't apply to them and showing it makes the flow feel like it isn't for them.

~60 seconds, you on camera:

> Your whole life, someone else built your schedule. School, grades, the next step. This is the first year nobody is forcing you to do anything — which means it's the only real chance you get to stop and ask what direction you actually want, how you want to live, and who you want to be. Most people spend that year on autopilot. Here are some questions worth answering before you pick.

**Alternate opener for the during-college and high-school paths** (shorter, different premise): you have limited time and one shot at using it well — here's what separates a trip you remember from one you don't. Content TBD.

---

## Q3 — Program gender — FILTER

**"What kind of program are you looking for?"**

- Boys only
- Girls only
- Mixed
- No preference

Asks about the *program's* composition, not the user's identity. Same filtering result, no invasive question.

**Hard filter.** "Mixed" leaves single-gender paths open.

**Video:** none here. The co-ed argument lives in Q8.

---

## Q4 — Service intent — CHALLENGE (conditional)

**Shown if** Q1 = right after high school / after college / working.
**Skipped** for high-school and during-college paths — those people are coming for summer, volunteering, or academic programs and the question is noise.

**"Are you planning to serve?"**

- Army
- Sherut leumi
- Not planning to — college in the States
- I don't know yet

**Fires on "not planning to":** the Torah-before-college argument. Campus is not neutral ground; you'll be asked to defend who you are by people who've thought about it more than you have. A year of learning first is the difference between having answers and having opinions.

**Fires on "I don't know yet":** "you don't have to decide today, but don't let the program decide for you."

**Note:** army and sherut leumi are different tracks, not one path with a gender switch. See the separate sherut leumi question list.

---

## Q5 — Timing before service — CHALLENGE

*Shown if Q4 = army / sherut leumi / unsure.*

**"When would you want to start serving?"**

- Straight in, as soon as I can
- A year first
- Two years first
- Not sure

**Fires on "straight in":** the misery clip. Delivered by a lone soldier who did *not* take the year. You might get the unit you want with weak Hebrew — you'll also spend eighteen months not understanding what's said to you, and that's a different experience than the one you're picturing.

**Fires on "two years":** maximalist check — do you know what the second year costs, and are you choosing it or deferring a decision?

---

## Q6 — Program essence — TRADEOFF + one hard distinction (flagship)

**"What kind of program?"**

**Options depend on the Q3 gender answer.** Same question, three option sets.

*If boys only:*
- Israeli yeshiva
- English-language / American yeshiva
- Religious mechina
- Non-religious / regular mechina
- Academic (college credit)
- Experience / travel-focused

*If girls only:*
- Israeli midrasha
- American seminary
- Religious mechina
- Non-religious / regular mechina
- Academic (college credit)
- Experience / travel-focused

*If mixed or no preference:*
- Religious mechina
- Non-religious / regular mechina
- Academic (college credit)
- Experience / travel-focused

Yeshivot, midrashot and seminaries drop out of the mixed list — they don't exist co-ed. This means the mixed path is materially shorter and the taxonomy video below doesn't apply to it. Mixed needs its own, simpler clip: the religious-versus-regular mechina distinction only.

**The split matters more than anything else on this page.** Lumping the two mechina types together is the single most misleading thing the site currently does. A religious mechina sits close to an American yeshiva. A regular mechina is a different thing entirely.

**Video A — the taxonomy clip (tradeoff, no ranking).** Two or three people from different program types:

> Israeli yeshivot focus on the Torah being learned, for its own sake. American yeshivot focus on the growth of the person, through the Torah. Religious mechinot focus on growth through Torah with the army waiting at the end. Which means an American yeshiva and a religious mechina have more in common with each other than the two yeshiva types do — the opposite of what the names suggest.

**Video B — fires on "non-religious / regular mechina" (challenge, your position, labeled as yours).**

> A regular mechina will integrate you with Israelis better than almost anything else you can do, and that's worth a lot. But it's missing the piece I think matters most in the year before the army — the spiritual side, the part that decides who you are when the army starts telling you who to be. That's my view. Someone who did one may tell you differently, and it's worth hearing them.

Best filmed with an actual regular-mechina alumnus following you. Otherwise this is you dismissing a whole category of program that's in your own directory.

**Selecting one essence does not exclude the others** from results. Weighting only.

---

## Q7 — Learning — CHALLENGE

**"How do you feel about sitting and learning?"**

- I love it
- It's fine
- School killed it for me
- I've honestly never tried it properly

**Fires on the last two.** Your argument, your face:

> "I'm not a learning guy" is almost always a claim about school, not about learning. School was compulsory, graded, and someone else picked the subject. None of that is true this year. You've never tested whether you like it — you've tested whether you like being made to.

---

## Q8 — Co-ed — CHALLENGE (label it as your view)

*Shown if Q3 = mixed or no preference.*

**"Single-gender or mixed program?"**

- Single gender
- Mixed
- Doesn't matter to me

**Fires on "mixed" / "doesn't matter."** Stated as opinion, on camera:

> Single-gender programs tend to be more studious and there's less pulling your attention. Mixed can be more fun. I think fun is sometimes the thing that quietly costs you the year — but that's my view, and plenty of people would tell you otherwise.

**Better version:** film someone who did a co-ed program and would do it again, forty seconds, right after you. Then it's a tradeoff and your credibility survives.

---

## Q9 — Israeli integration — CHALLENGE

**"Who do you want to be around?"**

- Mostly Anglos
- A real mix
- Mostly Israelis
- No preference

**Fires on "mostly Anglos."** Delivered by an alumnus, not you:

> If there's any chance — even a small one — that you end up staying, the year you spend surrounded by Americans is a year you don't spend learning to actually live here. Half the people who say "probably not" at eighteen are wrong about that.

---

## Q10 — Hebrew vs. learning skills — TRADEOFF

*Shown if Q6 = Israeli yeshiva or American yeshiva.*

**"Which comes first — the Hebrew or the learning?"**

- Israeli yeshiva now, pick up Hebrew as I go
- English-language yeshiva first, build the skills, then an Israeli one
- I don't know the difference

**Filmed as an actual machlokes.** Two rabbanim, forty seconds each, contrasting, unresolved. One: you learn Hebrew by living in it, there's no substitute for immersion. The other: arriving without the tools means a year of drowning; skills first means the immersion actually lands.

---

## Sherut leumi branch — in progress

Fires when Q4 = sherut leumi. Three answers gathered so far; the rest of the question list is still open.

**What we know:**

*The "take a year first" argument is weaker here, and should not be reused as-is.* The army can't be paused, it's confining, and it challenges you constantly. Sherut leumi is different: you go home daily, you can stop whenever you want, and you can do a year of something else in the middle of service. A year beforehand is still worthwhile — it just isn't the same argument, and delivering the army version to a girl would ring false.

*There is no Hebrew-and-misery equivalent.* Plenty of placements work without Hebrew. Hospital yes, MDA no. Some schools yes, not all. So Hebrew becomes a **placement-scope** question, not a suffering question: weak Hebrew doesn't make you miserable, it narrows what you can do. That reframe is the clip.

*The correction worth filming:* the assumption that one type of girl does sherut leumi. Many different types do, and sorting yourself out of it on that basis is a mistake. This is a self-selection failure — the same shape as the Atzmona problem — which makes it a strong candidate for the girls' side opener rather than a mid-flow clip.

**Implication for Q5 (timing before service):** on the sherut path, the question changes from "when do you start" to "what do you want to be able to do" — because service can be interrupted and Hebrew gates placements rather than experience quality.

**Still needed:** the army-versus-sherut fork (highest-value clip on this side, filmed as a machlokes), decision timeline, whether a prep year exists or should, midrasha/seminary taxonomy, and the co-ed question for girls. See the separate question list.

## Blocked-filter fallbacks — open

When a combination of answers returns too little, the flow needs somewhere to send people rather than a dead end. Currently unspecified. Options to decide between: relax the weakest-weighted filter and say so explicitly, offer the nearest category with a one-line explanation of what's being traded, or route to the mentor handoff. Needs a decision before build.

## Cut from v1

**Conditions question** ("how much do the physical conditions matter") — cut. Not relevant enough to spend a question or a clip on.

---

## Trim list

Ten is too many live; completion will tank. Recommended shipping set: **Q1, Q2, Q3, Q4, Q5, Q6, Q7** — seven including the opener. Hold Q8–Q10 for v2 or surface them on the results page.

## Still open

- **Religious trajectory question** — "where do you want to be religiously in two years, not where you are now." One of the strongest arguments and it has no home yet. May be too personal for a public quiz; test whether it belongs in the flow or in the mentor handoff.
- **Q6 Video B and Q8** are your positions, not tradeoffs. Per question: own it with your face, or find the other side and film them too.
- **Sherut leumi content** is unwritten. Every argument here is army-shaped. See the separate question list.
- **Possible new tag:** pre-sherut-leumi programs.
- **MVP video count:** Q2 opener, Q5, Q6 Video A, Q7 — four clips. Smallest version that tests the mechanism.

## Cheapest test before building any of this

/find is live and has traffic. Put one rough phone-shot clip on one question — Q7 or Q9 — and compare answer distribution against the version without it. If the clip shifts how people answer the question that follows, the mechanism works. If not, no production budget saves it.
