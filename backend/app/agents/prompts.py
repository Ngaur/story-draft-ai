# All prompts are module-level constants. Never construct prompt strings inline in nodes.

# ── System prompts ────────────────────────────────────────────────────────────

SYSTEM_PROMPT_ANALYST = """You are a senior business analyst and agile practitioner with deep \
expertise in writing implementation-ready user stories. You produce complete, unambiguous User \
Story Packs that development teams and QA can act on immediately without needing to ask follow-up \
questions. You always ground your outputs in the source material and stakeholder answers provided — \
you do not invent requirements that are not supported by the inputs. When inputs are insufficient \
you flag assumptions explicitly rather than guessing. You identify implicit operational requirements \
that are not stated in the source document but are essential for the described feature to work — \
for example, a rule engine implies master data that must be maintained, an approval step implies \
an audit trail, real-time evaluation implies a latency SLA. You surface these explicitly in the \
stories you draft rather than leaving them as hidden implementation risks."""

SYSTEM_PROMPT_FACILITATOR = """You are an expert product discovery facilitator. Your role is to \
ask targeted clarifying questions that surface hidden requirements, edge cases, and business \
constraints. Your questions are specific, actionable, and avoid jargon."""

# ── Node prompts ──────────────────────────────────────────────────────────────

PARSE_DOCUMENT_PROMPT = """You are given the full text of a product requirements document. \
Identify and extract all distinct concept notes — these are self-contained product ideas, \
features, capabilities, or functional areas described in the document.

For each concept note provide:
- A concise title (3–8 words, noun phrase)
- A 2–4 sentence description grounded in the source text

WHAT COUNTS AS A CONCEPT:
- A concept is a major capability or feature area (e.g. "BIN-Based Intelligent Routing", \
  "Selective BIN Blocking", "Maker-Checker Rule Governance")
- A concept is NOT a sub-function, an API endpoint, or a specific technical behaviour within \
  a larger feature (e.g. "Route by MCC", "Retry failed transactions", "Configure a single rule" \
  are NOT concepts — they are implementation details of a broader concept)
- If several related sub-functions share the same user persona, business goal, and data scope, \
  they belong to ONE concept, not multiple

CONCEPT DESCRIPTION RULES:
- Preserve domain-specific terminology, system names, acronyms, and named entities exactly as \
  they appear in the source document — do not substitute generic terms \
  (e.g. keep "AMPS", "FSS", "CYBS", "MPGS", "BINs", "acquirer" — do not replace with \
  "the system", "payment gateway", "the platform")
- Include named systems, platforms, integrations, and data entities that are in scope for \
  the concept
- If the document names specific user roles (e.g. "Payments Ops", "Risk team"), include them

EXTRACTION RULES:
- Exclude implementation details, infrastructure concerns, and generic boilerplate
- Focus on user-facing or business-facing concepts only
- Each concsept must be distinct — do not duplicate similar idea
- Extract as many concepts as the document contains — there is no upper limit.

Document text:
{document_text}"""

MERGE_CONCEPTS_PROMPT = """You are given concept notes that were independently extracted from \
different sections of the same product document. Some may be duplicates or near-duplicates — \
the same idea expressed with slightly different wording across sections.

Your task:
- Identify and merge duplicate or near-duplicate concepts into one richer entry
- Preserve every distinct idea — do not discard unique concepts
- For merged concepts, combine the best parts of each description into one substantive \
  2–4 sentence description that retains all domain-specific details
- Preserve all domain-specific terminology, system names, acronyms, and entity names \
  exactly as they appear — do not substitute generic terms
- Return all unique concept notes — there is no upper limit on how many you may return. \
  Merge only genuine duplicates (same feature described twice). Do not merge distinct \
  features to reduce count. Minimum: 2 concepts.

Concepts extracted from document sections (JSON):
{concepts_json}"""

GENERATE_QUESTIONS_PROMPT = """You are given a list of concept notes extracted from a product \
document. For each concept, generate 3–8 high-value clarifying questions that a senior business \
analyst would ask to produce a complete, implementation-ready user story. Questions must collectively \
cover all of the following aspects: business context, user personas, data governance, acceptance \
criteria, pre/post conditions, edge cases, dependencies, governance workflow, performance SLA, \
MVP scope boundaries, and implicit operational dependencies.

CONTEXT AWARENESS — MANDATORY:
If Supporting Document Summaries are provided below, treat them as already-known information. \
For each coverage target, check whether the supporting documents already answer it clearly and \
completely. If they do, skip that question — do not ask for information you already have. \
The minimum number of questions is 3 (not 5) when supporting context is present and covers \
several targets. Only generate questions for gaps that the supporting documents leave open.

QUESTION QUALITY RULES:
- Reference specific entities: use the exact system names, acronyms, domain objects, and personas \
  named in the concept description — never write "the system" or "users" when the concept names \
  them specifically (e.g., if the concept says "AMPS", write "AMPS", not "the system").
- Clarify unknown acronyms and platforms: if the concept references a system, platform, or acronym \
  that is not explained (e.g. "AMPS", "FSS", "CYBS", "MPGS"), ask (a) what it is and (b) whether \
  it is an existing production system or being built new for this initiative.
- Do not ask questions whose answers are already stated in the concept description or clearly \
  covered by the Supporting Document Summaries provided below.
- Each question must unlock information that directly improves one or more story sections.
- Do not repeat equivalent questions across concepts.
- Surface implicit operational dependencies: if a concept requires reference data, configuration \
  records, or master data to work (e.g. a routing rule engine needs BIN reference data), ask how \
  that data is created, maintained, and by whom — this often surfaces a separate story.
- Include conditional follow-ups inline: if a question asks "Can X happen?", always add a \
  companion question asking "When X happens, how should the system resolve it?" — never leave \
  the resolution undefined.
- For any concept involving rules, policies, or configuration: always ask at what scope they \
  apply using a multiple_choice question (e.g. "Global platform-wide / Merchant-specific / \
  Terminal (MID/TID) specific / Channel-specific").
- Question diversity is mandatory: across your questions per concept, you MUST use at least \
  two distinct question types (open, yes_no, multiple_choice, multiple_select). A set of \
  questions that uses only open-ended questions is invalid.

QUESTION TYPE SELECTION — MANDATORY RULES:

TARGET MIX across your questions per concept (approximate):
- ~30 % 'yes_no'
- ~25 % 'multiple_choice'
- ~25 % 'multiple_select'
- ~20 % 'open'  ← only ~1–2 open questions per concept; use structured types for everything else

- MUST use 'multiple_choice' (exactly 3–4 options, pick ONE) for:
  * Conflict resolution ("When multiple rules match, which wins: Priority order / Most restrictive \
    wins / First match / Configurable per rule?")
  * Scope level selection ("At what level do rules apply: Global / Merchant / MID-TID / Channel?")
  * Fallback sequencing ("How are fallback acquirers tried: Sequential / Weighted / Configurable?")
  * Approval chain type ("What approval is required: No approval / Maker-Checker / Multi-level?")
  * Mutually exclusive approach choices where only one answer is correct

- MUST use 'multiple_select' (3–5 options, pick ALL that apply) for:
  * Multi-role access ("Which teams will use this capability? Select all that apply: \
    Payments Ops / Risk / Product / Tech-SRE / Automated system only")
  * Multi-action outcomes ("What should a soft decline do? Select all that apply: \
    Retry on fallback acquirer / Trigger 3DS step-up / Return custom decline message")
  * KPI and metric sets ("Which metrics must be tracked? Select all: Auth success rate / \
    Cost per transaction / Fraud rate / Issuer decline codes / Latency")
  * Feature flags or toggles where several can be simultaneously active
  * Any question where more than one answer is valid at the same time

- MUST use 'yes_no' for:
  * Capability confirmations ("Does AMPS already support X?", "Is PCI DSS in scope?")
  * Binary scope decisions ("Do changes require approval before going live?")
  * Platform status confirmations ("Is AMPS an existing production system?")
  * Toggle-style constraints ("Can a single routing rule define multiple fallback acquirers?")

- Use 'open' ONLY when structured types cannot capture the nuance — reserve for questions \
  like latency budget ("What is the target latency budget for BIN rule evaluation in AMPS?"), \
  scale targets ("What is the expected peak TPS for the routing engine?"), or \
  approval chain description. Limit to ~1–2 open questions per concept.

COVERAGE TARGETS — across your questions for each concept, collectively cover:
1. Primary user persona and secondary users/stakeholders
2. Business goal and measurable success metric
3. Key pre-conditions and system state requirements
4. Data sensitivity, governance, or compliance concerns (if applicable)
5. Critical error paths and edge cases the team must handle
6. External system, team, or API dependencies — including whether named systems are existing \
   or new, and what their current integration status is
7. Governance and approval workflow — do changes made through this concept require approval before
   going live? Is there a maker-checker or multi-level review requirement? Who approves?
8. Performance and scale requirements — what is the latency budget for the operation? What request
   or transaction volume must it support (average and peak TPS/RPM)? Are there SLA commitments?
9. MVP scope boundaries — what is explicitly deferred to a future phase? What is the minimum viable
   feature set for the first release? Are there known future requirements the design must
   accommodate without implementing now?
10. Implicit operational dependencies — does this concept depend on master data, reference data,
    configuration records, or lookup tables that must also be maintained? If so, how is that data
    managed and by whom — is a separate admin or ops workflow needed?

The concept_id for each question MUST exactly match the id field of the corresponding concept.

Concept note (JSON):
{concept_nodes_json}"""

DRAFT_STORIES_PROMPT = """You are given concept notes from a product document and the human \
stakeholder's answers to clarifying questions. Some questions may have been skipped — the \
clarification_answers list contains ONLY the questions the stakeholder chose to answer. \
Use every provided answer to enrich the story. For questions that were skipped, infer \
reasonable defaults from the concept description and list each inference explicitly in the \
'assumptions' section of the story so the team can validate them.

LANGUAGE AND TERMINOLOGY RULES — these apply to every field of every story:
- Use the exact system names, platform names, acronyms, domain objects, and entity names from \
  the concept description and clarification answers throughout. Never replace specific terms with \
  generic substitutes. Examples: write "AMPS" not "the system"; write "acquirer" not "payment \
  gateway"; write "BINs" not "card identifiers"; write "FSS / CYBS / MPGS" not "gateway A / B".
- The epic_title must reflect the actual platform or initiative name from the source document, \
  not a generic description. If the document is about "AMPS BIN Routing", the epic title must \
  include "AMPS" and "BIN", not a paraphrase like "Optimize Payment Gateway Routing".
- The role must be the specific operational job title confirmed in the clarification answers \
  or named in the concept description (e.g. "Payments Ops user", "Risk Analyst", "Finance \
  Manager"). Never use generic roles like "user", "payment processor", "admin", or "manager" \
  unless that exact title was specified.
- Acceptance criteria, example data, edge cases, and test scenarios must reference the named \
  systems, entities, and values from the domain — not placeholders like "Gateway A", "User X", \
  or "System B".

DATA GOVERNANCE RULE:
- For any concept involving payment transactions, card data, user PII, financial records, or \
  regulated industries: the data_governance list is NEVER empty. It must include at minimum: \
  what data is handled and its classification, how it is protected in transit and at rest, \
  what must NOT be logged (e.g. full PAN, CVV), applicable regulatory scope (e.g. PCI DSS), \
  and the retention policy.

STORY COUNT AND GRANULARITY RULES:
A concept may produce one or more user stories. Your goal is stories that a single developer \
or a small squad can implement and deliver to production in one sprint. Apply the following:

WHEN TO PRODUCE MULTIPLE STORIES FROM ONE CONCEPT:
- A concept with a management / configuration plane (Ops configures rules, uploads data, \
  approves changes) AND a runtime / evaluation plane (system evaluates rules in real time \
  during transactions) is a strong split — these have different actors, different SLAs, and \
  different technical dependencies. They should be two separate stories.
- A concept that is revealed by clarification answers to also require a supporting operational \
  capability (e.g. "routing rules depend on BIN master data — who maintains it?") should \
  generate an additional story for that operational need, even if it was not an explicit \
  concept node.
- A concept whose combined scope would score 13+ story points is a signal to split further. \
  Each individual story should be 1–8 story points.
- Different personas, different approval chains, or significantly different data flows within \
  one concept are also valid split criteria.

WHEN NOT TO SPLIT:
- Do NOT create separate stories for individual CRUD operations on the same entity \
  (create / update / delete / view of routing rules is one story, not four).
- Do NOT create a story for a sub-step that has no independent business value on its own \
  (e.g. "Validate BIN format" is not a story — it is an acceptance criterion inside a story).
- Do NOT create stories for things that are clearly assumptions or NFRs — those belong in \
  sections of an existing story.

INVEST COMPLIANCE RULES — every story you produce must satisfy all six criteria:

- Independent: the story must be deliverable without depending on another unstarted story. \
  If a dependency exists, call it out explicitly in the dependencies section and confirm \
  whether it is a blocker or non-blocker.
- Negotiable: avoid prescribing implementation solutions. Describe the desired outcome and \
  let the team determine approach.
- Valuable: the benefit field must state a concrete, measurable business or user outcome — \
  not a technical deliverable. "Reduces manual routing errors by enabling BIN-level \
  acquirer selection" is valuable; "implements the BIN lookup" is not.
- Estimable: provide enough detail that a developer can give a point estimate. Every \
  acceptance criterion must be testable and concrete.
- Small: each story should be completable by a single developer or small squad within one \
  sprint. If story_points_estimate would be 13, split the story further before outputting it.
- Testable: every acceptance criterion must be written in Given-When-Then format with \
  specific, verifiable outcomes — no vague assertions like "the system works correctly".

GRAMMAR RULE: the `want` field (used in "As a [role], I want [want]") MUST begin with \
an infinitive verb phrase: "to [verb] …" — e.g. "to configure BIN-based routing rules \
in AMPS", NOT "configure routing" or "I want configure routing". The full sentence read \
as "As a Payments Ops user, I want to configure BIN-based routing rules in AMPS, so \
that…" must be grammatically correct.

TARGET OUTPUT: typically 1–3 stories per concept node. For a feature document with 5 concepts, \
aim for 5–8 total stories. All stories must use the domain terminology rules above.

Each story MUST contain all 15 sections listed below. Be thorough, specific, and \
implementation-ready. Do not use vague language or placeholder text — every field must \
contain substantive, grounded content.

SECTIONS REQUIRED:

1. epic_title
   The name of the epic this story belongs to. Must include the actual platform or initiative \
   name from the source document (e.g. "BIN Routing & Blocking in AMPS", not \
   "Optimize Payment Gateway Routing"). Outcome-focused, 3–8 words.

2. title
   Short, outcome-focused user story title in imperative mood (5–10 words). Use domain \
   terminology from the concept (e.g. "Configure BIN-Based Routing Rules in AMPS", not \
   "Implement Intelligent Routing for Transactions").

3. role / want / benefit
   Complete the user story statement:
   "As a [role], I want [want], so that [benefit]."
   - role: the specific operational job title from the clarification answers or concept \
     description — never generic (e.g. "Payments Ops user", not "payment processor")
   - want: the specific capability using domain terminology from the concept
   - benefit: the measurable business value delivered, grounded in the stated objectives

4. detailed_description
   Full prose context covering: the business problem being solved, who is affected, \
   expected behaviour, scope boundaries, and any known constraints. Minimum 3 sentences.

5. pre_conditions
   Bulleted list of conditions that MUST be true before work begins.
   E.g. user must be authenticated, feature flag must be enabled, upstream API must be available.

6. post_conditions
   Bulleted list of conditions that MUST be true after the story is complete.
   E.g. record is persisted to database, downstream system is notified, audit log entry is written.

7. data_governance
   Bulleted list of data-related considerations. For payment, financial, healthcare, or any \
   regulated domain this list is NEVER empty — it must address all of the following that apply:
   - What data is handled and its classification (e.g. card data, PAN, BIN only, PII)
   - Data protection in transit (encryption standard) and at rest (encryption + access control)
   - Regulatory scope (e.g. PCI DSS in scope / out of scope, GDPR, local data residency)
   - Masking, tokenization, or anonymisation rules (e.g. only BIN stored, full PAN not persisted)
   - Logging constraints — explicitly state what must NOT appear in logs (e.g. full PAN, CVV, expiry)
   - Retention and archival policy (duration, deletion rules)
   Provide an empty list ONLY for concepts that genuinely handle no sensitive or regulated data.

8. acceptance_criteria
   Given-When-Then acceptance criteria covering BOTH functional and non-functional requirements. \
   Minimum 4 criteria. At least one criterion must address a non-functional requirement \
   (performance SLA, security control, accessibility standard, error handling, etc.).
   Format each as: "Given [context], When [action], Then [outcome]."
   Do not use vague statements like "The system should work correctly." Every criterion must \
   have a concrete, testable Given, a specific When action, and an unambiguous Then outcome.

9. assumptions
   Bulleted list of assumptions made during story creation that have not been formally confirmed. \
   Each item must be a clear, verifiable statement.

10. assertions
    Bulleted list of what is EXPLICITLY OUT OF SCOPE for this story:
    - Functional limitations (what the feature intentionally does NOT do)
    - Technical limitations (known constraints)
    - Operational constraints
    - Areas intentionally excluded from this build

11. edge_cases
    Bulleted list of unusual flows, boundary conditions, and failure scenarios. \
    For each, state the scenario and the expected behaviour or error response.

12. dependencies
    Bulleted list of system, team, API, or data dependencies this story relies on. \
    Flag which are blockers vs. non-blockers.

13. example_data
    Concrete, realistic examples for developers and QA. Include sample inputs, \
    expected outputs, and representative use cases. Use realistic values, not "foo/bar". \
    Where applicable include example records, API payloads, CSV structures, or table rows.

14. test_scenarios
    Key test cases that QA must execute for this story. For each scenario state what is \
    being tested and what the expected result is. Cover:
    - Functional happy path: primary flow executes successfully end-to-end
    - Negative / error paths: invalid input, service unavailable, unauthorised access
    - Boundary conditions: first/last item, empty set, maximum volume or length
    - Non-functional: performance under expected peak load, security controls enforced
    Format each as: "Scenario: [description] → Expected: [outcome]"

15. definition_of_done
    Specific, measurable checklist for story completion. Must include:
    - Code complete and peer-reviewed
    - Unit tests written and passing (minimum coverage threshold if known)
    - Integration/E2E tests passing
    - Documentation updated (API docs, runbook, etc.)
    - Product owner / stakeholder sign-off obtained
    - Deployed to target environment
    - Any compliance, audit, or accessibility requirements met

METADATA:
- story_points_estimate: Fibonacci (1, 2, 3, 5, 8, or 13) based on complexity
- priority: High / Medium / Low based on stakeholder signals

The concept_id of each story MUST match the id of the concept it was derived from.
Ground every field in the original concept description AND the clarification answers.

concept notes (JSON):
{concept_nodes_json}

Clarification answers (JSON):
{clarification_answers_json}"""

REFINE_STORIES_PROMPT = """You are given a set of User Story Packs that have been reviewed by a \
human stakeholder. The stakeholder has:
1. Manually edited one or more fields (provided as the current story content below)
2. Provided free-text refinement feedback describing additional changes needed

Your task:
- Apply the refinement feedback to produce updated stories
- Preserve ALL manual edits the stakeholder made — do not revert any field they changed
- Only modify fields where the refinement feedback explicitly calls for a change
- If the feedback applies to all stories (e.g. "make acceptance criteria more testable"), \
  apply it consistently across every story
- If the feedback targets a specific story or section, only modify that story/section
- Maintain all 15 sections in every story — do not drop or abbreviate any section
- Ensure all acceptance criteria remain in Given-When-Then format after refinement

CHANGE SUMMARY RULE:
For EACH story you return, populate the `change_summary` field with 1–3 sentences in \
past tense describing what actually changed in that story during this refinement pass \
(e.g. "Tightened acceptance criteria into explicit Given-When-Then format; added two \
edge cases for timeout and concurrent update scenarios; raised priority to High to \
reflect stakeholder urgency."). If the feedback did not result in any change to a \
particular story, output the JSON value null (not the string "null", not "No changes \
were made" — literally the JSON null value) for the `change_summary` field.

Refinement feedback from stakeholder:
{refinement_feedback}

Current stories (may include manual edits, JSON):
{stories_json}"""

REFINE_ADDITIVE_PROMPT = """You are reviewing refinement feedback from a human stakeholder to \
determine whether any BRAND-NEW user stories need to be created that do not currently exist \
in the story pack.

Your ONLY job is to create new stories explicitly requested by the feedback.
- Do NOT return or modify any existing stories — those are handled separately.
- If the feedback does not request any new stories, return an EMPTY list.
- If the feedback does request new stories, create them in full following all standard rules:
  all 15 sections, INVEST principles, Given-When-Then acceptance criteria, and Fibonacci \
  story points.
- Set `concept_id` to the id of the most relevant existing story's concept_id (from the \
  summary below), or generate a new UUID if the new story belongs to a completely new concept.
- Set `change_summary` to a sentence describing what was added, e.g. "New story added per \
  stakeholder request for rule engine implementation coverage."

Examples of ADDITIVE feedback (you SHOULD create stories):
  - "add a story for the implementation of the rule engine"
  - "we need a story covering the admin audit log export feature"
  - "include a user story for password reset via email"

Examples of MODIFICATION feedback (return EMPTY list — not your job):
  - "make acceptance criteria more testable"
  - "tighten the Given-When-Then format across all stories"
  - "the routing story needs more edge cases"

Existing stories (title, epic, IDs — do NOT return any of these):
{existing_stories_summary}

Refinement feedback from stakeholder:
{refinement_feedback}"""


# ── Supporting document summarisation ─────────────────────────────────────────

SUMMARISE_SUPPORTING_DOC_PROMPT = """You are given the text of a supporting reference document \
(e.g. a technical specification, architecture decision record, data model, or domain glossary) \
that accompanies a product requirement document.

Produce a concise 200–400 word summary that captures ONLY what is relevant to writing \
implementation-ready user stories:

1. Core purpose and scope of this document
2. Key domain entities, their definitions, and relationships
3. Business rules, constraints, and invariants
4. Technical requirements, limitations, or non-functional expectations
5. Important terminology, acronyms, or domain-specific vocabulary

Omit: table of contents, revision history, formatting instructions, organisational boilerplate, \
and any content that a story writer would never reference.

Document text:
{document_text}"""
