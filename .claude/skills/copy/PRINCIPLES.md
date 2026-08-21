# Copy Principles — Rules & Examples by Category

---

## CTAs (Buttons, Links, Submit Actions)

**The rule:** Verb-first. Expose the benefit the user gets, not the action they take.

**Banned words:** Submit, Click here, OK, Continue, Proceed, Go, Yes, No (without context)

| Bad | Good |
|-----|------|
| Submit | Save Changes |
| Continue | Set Up Your Account |
| OK | Got It |
| Click here | See All Plans |
| Sign Up | Start Free Trial |
| Buy | Get Lifetime Access |
| Delete | Delete Project |
| Yes | Yes, Remove It |
| Send | Send Message |
| Next | Choose a Plan |

**Rules:**
- Start with a verb ("Save", "Start", "Get", "Send", "Create", "Delete")
- Name the thing being acted on when it adds clarity ("Delete Project" not "Delete")
- For destructive actions: include the object + severity ("Delete Account Forever" not "Delete")
- For free actions: lead with "Get" or "Start" ("Get Started Free" not "Sign Up")
- Primary CTA: 2–4 words max. Secondary CTA: can be longer.
- Never two CTAs that start with the same verb on the same screen

---

## Error Messages

**The rule:** Say what failed. Say what to do. Never blame the user.

**Banned phrases:** Something went wrong, An error occurred, Invalid input, Please try again, Error, Failed

| Bad | Good |
|-----|------|
| Something went wrong | Couldn't save your changes — check your connection and try again |
| Invalid email | Enter a valid email address (like you@example.com) |
| Password is incorrect | Wrong password — try again or reset it |
| Email already in use | That email is already registered — sign in instead |
| An error occurred | Your session expired — sign in again to continue |
| Invalid input | Password must be at least 8 characters |
| Upload failed | File too large — upload an image under 5MB |
| Request failed | Couldn't connect to the server — try again in a moment |

**Rules:**
- Lead with what failed, not "Error:" or an icon alone
- Follow immediately with what to do ("— try X instead", "— click here to Y")
- Use plain language: no HTTP codes, no stack traces, no "exception"
- Never blame: "You entered an invalid…" → "That email isn't valid…"
- For recoverable errors: show the recovery action inline ("Retry", "Reset password")
- For validation: be specific about the rule that failed, not just "invalid"
- Tone: calm, not alarming. It's a bump in the road, not a disaster.

---

## Empty States

**The rule:** Tell the user what goes here. Show what's possible. Give them a way to fill it.

**Banned phrases:** No results, Nothing here, Empty, No data, No items found

| Bad | Good |
|-----|------|
| No projects | You haven't created any projects yet — start your first one |
| No results | No results for "dashboard" — try a different search term |
| Nothing here | Your inbox is empty — messages from your team will appear here |
| No notifications | You're all caught up — no new notifications |
| No data | Connect your account to see your analytics here |

**Structure:** What goes here + why it's empty + one CTA to fill it.

```
[What this space is for]
[Why it's empty / what the user needs to do]
[CTA button: "Create Project" / "Connect Account" / "Invite Team"]
```

**Rules:**
- Never just a heading with no explanation
- The CTA in the empty state should be the same CTA that creates the first item
- For search empty states: suggest what to try instead (broader term, check spelling)
- For filter empty states: offer to clear filters
- For permission-based empty states: explain what permission is needed
- Illustration or icon is optional but the text must stand alone

---

## Placeholders

**The rule:** Show a real example of valid input. Never repeat the label.

| Bad | Good |
|-----|------|
| Email address | you@company.com |
| Password | ••••••••  |
| Full name | Jane Smith |
| Phone number | +1 (555) 000-0000 |
| Company | Acme Corp |
| Search | Search projects… |
| Message | What's on your mind? |
| URL | https://yoursite.com |
| Amount | 0.00 |

**Rules:**
- Real example > descriptive label ("jane@example.com" not "Your email address")
- Search inputs: use "Search [thing]…" format with the ellipsis
- Textarea: can be a prompt question ("What's on your mind?" "Describe your issue")
- Never use placeholder as a substitute for a visible label — they disappear on focus
- Number inputs: show the format ("0.00" for currency, "+1 (555)…" for phone)

---

## Loading Messages

**The rule:** Say what is actually happening, not just "Loading".

**Banned:** Loading…, Please wait…, Processing…, Saving…, Fetching…

| Bad | Good |
|-----|------|
| Loading… | Loading your dashboard… |
| Saving… | Saving your changes… |
| Processing… | Processing your payment… |
| Uploading… | Uploading your photo… |
| Fetching… | Getting your reports… |
| Please wait… | Almost there… |
| Generating… | Generating your report — this takes about 10 seconds |

**Rules:**
- Always include the object ("your changes", "your photo", "3 files")
- For long operations (>5 seconds): give a time estimate ("usually takes ~30 seconds")
- For multi-step processes: show which step ("Step 2 of 3: Processing payment")
- If progress is measurable: show it ("Uploading 2 of 5 files…")
- Avoid "Please wait" — it's filler. The user knows to wait.

---

## Confirmation Dialogs

**The rule:** Name the specific thing. State the consequence. Make the action button crystal clear.

| Bad | Good |
|-----|------|
| Are you sure? | Delete "Q4 Marketing Report"? |
| This action cannot be undone | This will permanently delete the project and all its data |
| Confirm deletion | Delete Project |
| Yes / No | Delete Project / Keep It |
| Delete? | Delete this account permanently? |

**Structure:**
```
[Title]: [Verb] "[Object name]"?
[Body]:  This will [exact consequence]. [Recovery option if any.]
[CTA]:   [Destructive action] / [Cancel with context]
```

**Example:**
```
Delete "March Campaign"?
This will permanently remove the campaign and all its assets. 
This can't be undone.

[Delete Campaign]  [Keep Campaign]
```

**Rules:**
- Title: always name the specific thing being acted on
- Body: be explicit about what is destroyed and whether it's reversible
- Destructive button: red, named specifically ("Delete Campaign" not "Yes")
- Cancel button: named with context ("Keep Campaign" not "Cancel") when possible
- Never "Are you sure?" alone — it adds no information
- Never just "OK / Cancel" for destructive actions

---

## Tooltips & Helper Text

**The rule:** Explain the WHY, not the WHAT. The label already tells them what it is.

| Bad | Good |
|-----|------|
| Your email address | We'll send receipts and important updates here |
| Password | Must be at least 8 characters |
| Two-factor authentication | Adds a second step to sign-in — makes your account much harder to hack |
| API key | Keep this secret — anyone with this key can access your account |
| Slug | The URL-safe version of your name (auto-generated, you can edit it) |
| Webhook URL | We'll send a POST request here when events happen in your account |

**Rules:**
- Explain why the field exists or what it affects
- For constraints: state the rule ("8 characters minimum", "letters and numbers only")
- For technical fields: translate into plain English first, then the technical term in parentheses
- Max one sentence — if it needs more, it should be a link to docs
- Place inline (under the field) not in a tooltip if it's essential to completing the field

---

## Headings & Page Titles

**The rule:** Make the strongest true statement. Cut every filler word.

| Bad | Good |
|-----|------|
| Welcome to Dashboard | Your Overview |
| Getting Started | Set Up in 3 Minutes |
| Our Features | Ship Faster With Less Code |
| Plans & Pricing | Simple Pricing, No Surprises |
| About Us | Built by developers, for developers |
| Contact Us | Talk to a Real Person |
| Documentation | Everything You Need to Build |

**Rules:**
- No "Welcome to…" — the user knows they arrived
- No "Our…" — it's obvious it's yours
- Lead with the user's benefit, not your feature name
- Cut: "Introducing", "Announcing", "All your", "Everything about"
- Marketing headings: make a claim. Don't describe — promise.
- App headings: be descriptive and direct ("Your Projects", "Team Settings")
- Subheadings: support the heading, don't repeat it

---

## Microcopy (Helper text, hints, descriptions)

**The rule:** One sentence. Conversational. No jargon. Answers the question before the user asks it.

| Bad | Good |
|-----|------|
| Please ensure all fields are correctly filled | All fields are required |
| You will be redirected to the payment provider | You'll complete payment on Stripe's secure page |
| This feature requires an upgraded plan | Available on Pro and above — upgrade to unlock |
| Your account will be permanently deleted | Once deleted, your account and all data are gone for good |
| Changes may take up to 24 hours to propagate | Takes up to 24 hours to update everywhere |

**Rules:**
- First person where possible ("You'll be redirected" not "The user will be redirected")
- Active voice always ("Your data is encrypted" not "Data encryption is applied")
- One sentence max. If two sentences are needed, make it two separate UI elements.
- Never start with "Please" — it's filler and slightly condescending
- Avoid: "utilize", "leverage", "facilitate", "in order to", "please note that"
- Replace jargon with plain English, then add the term in parentheses if needed

---

## Marketing / Landing Page Copy

**The rule:** Headline → specific claim → proof → CTA. Every word earns its place.

### Hero section structure
```
[Headline]: The biggest benefit in the fewest words
[Subheadline]: Who it's for + how it works (one sentence)
[CTA]: What they get, not what they do
[Social proof]: Number, logo, or quote — immediately below CTA
```

### Good vs bad headlines
| Bad | Good |
|-----|------|
| The best tool for developers | Ship UI in minutes, not days |
| We help you build faster | 200+ components. Copy, paste, done. |
| Introducing our new platform | The design system that replaces your design system |
| Modern UI components | Production-ready components used by 10,000+ developers |

### Feature descriptions
- Lead with the outcome, not the feature name
- Bad: "Dark mode support" → Good: "Looks perfect in dark mode — zero config"
- Bad: "Customizable themes" → Good: "Change the entire look in one line of CSS"

### Social proof
- Specific numbers beat vague claims ("10,000 developers" not "thousands of developers")
- Named testimonials beat anonymous ones
- Logo wall placement: immediately after the hero CTA, not buried at the bottom

---

## Tone Consistency Rules

Match tone to the product type and the user's emotional state:

| Context | Tone |
|---------|------|
| Onboarding | Warm, encouraging, low-pressure |
| Dashboard | Neutral, efficient, data-first |
| Error states | Calm, helpful, never alarming |
| Empty states | Inviting, opportunity-framing |
| Destructive actions | Direct, serious, no lightness |
| Marketing | Confident, specific, benefit-first |
| Settings | Technical, precise, no fluff |
| Success messages | Brief celebration, then next step |

**Never mix tones within a single screen.** If the heading is playful but the error message is formal, the screen feels broken.
