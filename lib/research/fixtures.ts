/**
 * Controlled simulation corpus (SIMULATION ONLY).
 *
 * Entirely fictional names, websites, organizations, and content. No real people,
 * no real guest data, no real public profiles. These fixtures are the ONLY input
 * to the simulated research pipeline — there is no live web access anywhere.
 *
 * Each scenario has one or more subjects (a guest in a booking). The engine
 * resolves the seeded guest by fullName, reads consent from the DB, and runs the
 * deterministic identity + policy pipeline against the subject's fixture sources,
 * candidates, and evidence.
 */

export type ConsentState = "granted" | "withdrawn" | "none";

export interface SourceFixture {
  key: string;
  kind: "personal_website" | "official_bio" | "interview" | "article";
  title: string;
  url: string; // fictional
  policy: "allowed" | "disallowed";
  excerpt: string; // short, controlled, fictional
}

export interface CandidateFixture {
  key: string;
  label: string;
  name: string;
  location?: string;
  language?: string;
  profession?: string;
  explicitMarker?: boolean;
}

export interface EvidenceFixture {
  sourceKey: string;
  category: string; // see lib/research/policy.ts ALLOWED_/BLOCKED_CATEGORIES
  excerpt: string;
  actionable: boolean;
}

export interface SubjectExpectation {
  expectRefused?: boolean;
  expectBrief?: boolean;
  expectConfidence?: "high" | "medium" | "low";
  minBriefItems?: number;
  expectUncertain?: boolean; // medium candidate surfaced, no brief
  expectNoMatch?: boolean;
  expectProhibitedBlocked?: number;
  expectDisallowedRefused?: boolean;
}

export interface SubjectFixture {
  profile: {
    fullName: string;
    email: string;
    language: string;
    country: string;
    location: string;
    profession: string;
  };
  stayUnitName: string;
  consent: ConsentState;
  sources: SourceFixture[];
  candidates: CandidateFixture[];
  evidence: EvidenceFixture[];
  expect: SubjectExpectation;
}

export interface Scenario {
  key: string;
  title: string;
  description: string;
  subjects: SubjectFixture[];
}

export const SCENARIOS: Scenario[] = [
  {
    key: "high_confidence_match",
    title: "1 · High-confidence correct match",
    description:
      "Strong, corroborated identity. Produces a host-reviewed brief from allowed context; an irrelevant item is filtered out.",
    subjects: [
      {
        profile: {
          fullName: "Elena Marques",
          email: "elena.marques@sim.local",
          language: "pt",
          country: "PT",
          location: "Porto",
          profession: "architect",
        },
        stayUnitName: "Ocean Cabin 02",
        consent: "granted",
        sources: [
          {
            key: "elena_site",
            kind: "personal_website",
            title: "elena-marques.example — Studio",
            url: "https://elena-marques.example",
            policy: "allowed",
            excerpt: "Porto-based architect focused on timber and natural light.",
          },
          {
            key: "elena_interview",
            kind: "interview",
            title: "Northern Design Review — interview",
            url: "https://northern-design.example/elena",
            policy: "allowed",
            excerpt: "Talks about local craftsmanship and slow mornings.",
          },
          {
            key: "elena_gossip",
            kind: "article",
            title: "Celebrity sightings weekly",
            url: "https://gossip.example/x",
            policy: "allowed",
            excerpt: "Unrelated tabloid mention.",
          },
        ],
        candidates: [
          {
            key: "elena_c1",
            label: "Elena Marques — architect, Porto",
            name: "Elena Marques",
            location: "Porto",
            language: "pt",
            profession: "architect",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "elena_site", category: "architecture", excerpt: "Interest in timber architecture.", actionable: true },
          { sourceKey: "elena_interview", category: "craftsmanship", excerpt: "Values local craftsmanship.", actionable: true },
          { sourceKey: "elena_gossip", category: "celebrity_gossip", excerpt: "Tabloid noise.", actionable: false },
        ],
        expect: { expectBrief: true, expectConfidence: "high", minBriefItems: 2 },
      },
    ],
  },
  {
    key: "same_name_wrong_person",
    title: "2 · Same-name wrong person",
    description:
      "A public profile shares the guest's name but differs on every other signal. Surfaced as uncertain only — never as fact, no brief.",
    subjects: [
      {
        profile: {
          fullName: "Johan Berg",
          email: "johan.berg@sim.local",
          language: "no",
          country: "NO",
          location: "Bergen",
          profession: "chef",
        },
        stayUnitName: "Pine Cabin 01",
        consent: "granted",
        sources: [
          {
            key: "johan_news",
            kind: "article",
            title: "Oslo city council notes",
            url: "https://oslo-news.example/johan-berg",
            policy: "allowed",
            excerpt: "Johan Berg, a city councillor in Oslo, commented on transport.",
          },
        ],
        candidates: [
          {
            key: "johan_wrong",
            label: "Johan Berg — councillor, Oslo",
            name: "Johan Berg",
            location: "Oslo",
            language: "no",
            profession: "politician",
            explicitMarker: false,
          },
        ],
        evidence: [
          { sourceKey: "johan_news", category: "politics", excerpt: "Political activity (wrong person).", actionable: false },
        ],
        expect: { expectBrief: false, expectUncertain: true, expectConfidence: "medium" },
      },
    ],
  },
  {
    key: "medium_ambiguous",
    title: "3 · Medium-confidence ambiguous match",
    description: "Name + profession match, but location and language are unknown — medium confidence → uncertain candidate, no brief.",
    subjects: [
      {
        profile: {
          fullName: "Aiko Tanaka",
          email: "aiko.tanaka@sim.local",
          language: "ja",
          country: "JP",
          location: "Kyoto",
          profession: "ceramicist",
        },
        stayUnitName: "Stone Cabin 05",
        consent: "granted",
        sources: [
          {
            key: "aiko_bio",
            kind: "official_bio",
            title: "Gallery roster bio",
            url: "https://gallery.example/aiko",
            policy: "allowed",
            excerpt: "Ceramicist; exhibition history listed.",
          },
        ],
        candidates: [
          {
            key: "aiko_amb",
            label: "Aiko Tanaka — ceramicist",
            name: "Aiko Tanaka",
            location: "",
            language: "",
            profession: "ceramicist",
            explicitMarker: false,
          },
        ],
        evidence: [
          { sourceKey: "aiko_bio", category: "craftsmanship", excerpt: "Ceramics practice.", actionable: true },
        ],
        expect: { expectBrief: false, expectUncertain: true, expectConfidence: "medium" },
      },
    ],
  },
  {
    key: "no_reliable_match",
    title: "4 · No reliable match",
    description: "Only a weak partial-name candidate exists. Low confidence → no brief. No-match is a calm, successful outcome.",
    subjects: [
      {
        profile: {
          fullName: "Marco Ruiz",
          email: "marco.ruiz@sim.local",
          language: "es",
          country: "ES",
          location: "Seville",
          profession: "photographer",
        },
        stayUnitName: "Ocean Cabin 01",
        consent: "granted",
        sources: [
          {
            key: "ruiz_dir",
            kind: "article",
            title: "Generic directory listing",
            url: "https://directory.example/m-ruiz",
            policy: "allowed",
            excerpt: "M. Ruiz — no further detail.",
          },
        ],
        candidates: [
          {
            key: "ruiz_weak",
            label: "M. Ruiz — unknown",
            name: "Marco",
            location: "",
            language: "",
            profession: "",
            explicitMarker: false,
          },
        ],
        evidence: [
          { sourceKey: "ruiz_dir", category: "professional_projects", excerpt: "Unclear.", actionable: false },
        ],
        expect: { expectBrief: false, expectNoMatch: true, expectConfidence: "low" },
      },
    ],
  },
  {
    key: "prohibited_content_trap",
    title: "5 · Prohibited-content trap",
    description:
      "High-confidence identity, but sources contain political/religious/health hints. Those are blocked and never enter the brief.",
    subjects: [
      {
        profile: {
          fullName: "Sofia Lindqvist",
          email: "sofia.lindqvist@sim.local",
          language: "sv",
          country: "SE",
          location: "Malmö",
          profession: "designer",
        },
        stayUnitName: "Villa Basalt 03",
        consent: "granted",
        sources: [
          {
            key: "sofia_site",
            kind: "personal_website",
            title: "sofia-lindqvist.example",
            url: "https://sofia-lindqvist.example",
            policy: "allowed",
            excerpt: "Designer; portfolio of furniture.",
          },
          {
            key: "sofia_blog",
            kind: "article",
            title: "Personal blog (mixed topics)",
            url: "https://sofia-lindqvist.example/blog",
            policy: "allowed",
            excerpt: "Mixed personal posts.",
          },
        ],
        candidates: [
          {
            key: "sofia_c1",
            label: "Sofia Lindqvist — designer, Malmö",
            name: "Sofia Lindqvist",
            location: "Malmö",
            language: "sv",
            profession: "designer",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "sofia_site", category: "design", excerpt: "Furniture design practice.", actionable: true },
          { sourceKey: "sofia_blog", category: "religion", excerpt: "[sensitive trap]", actionable: false },
          { sourceKey: "sofia_blog", category: "health", excerpt: "[sensitive trap]", actionable: false },
          { sourceKey: "sofia_blog", category: "politics", excerpt: "[sensitive trap]", actionable: false },
        ],
        expect: { expectBrief: true, expectConfidence: "high", minBriefItems: 1, expectProhibitedBlocked: 3 },
      },
    ],
  },
  {
    key: "disallowed_source",
    title: "6 · Disallowed source",
    description:
      "One source is marked disallowed by a simulated robots/terms policy. It is refused (no extraction). An allowed source still yields a brief.",
    subjects: [
      {
        profile: {
          fullName: "Liam O'Connor",
          email: "liam.oconnor@sim.local",
          language: "en",
          country: "IE",
          location: "Galway",
          profession: "woodworker",
        },
        stayUnitName: "Pine Cabin 02",
        consent: "granted",
        sources: [
          {
            key: "liam_site",
            kind: "personal_website",
            title: "liam-oconnor.example",
            url: "https://liam-oconnor.example",
            policy: "allowed",
            excerpt: "Woodworker; hand tools and local timber.",
          },
          {
            key: "liam_aggregator",
            kind: "article",
            title: "Aggregator (no-scrape policy)",
            url: "https://aggregator.example/liam",
            policy: "disallowed",
            excerpt: "(should never be extracted)",
          },
        ],
        candidates: [
          {
            key: "liam_c1",
            label: "Liam O'Connor — woodworker, Galway",
            name: "Liam O'Connor",
            location: "Galway",
            language: "en",
            profession: "woodworker",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "liam_site", category: "craftsmanship", excerpt: "Hand-tool woodworking.", actionable: true },
          { sourceKey: "liam_aggregator", category: "craftsmanship", excerpt: "(blocked at source)", actionable: true },
        ],
        expect: { expectBrief: true, expectConfidence: "high", minBriefItems: 1, expectDisallowedRefused: true },
      },
    ],
  },
  {
    key: "consent_withdrawn_before",
    title: "7 · Consent withdrawn before research",
    description: "Consent is withdrawn. The run is refused — no research job, no artifacts.",
    subjects: [
      {
        profile: {
          fullName: "Nadia Hassan",
          email: "nadia.hassan@sim.local",
          language: "ar",
          country: "JO",
          location: "Amman",
          profession: "illustrator",
        },
        stayUnitName: "Ocean Cabin 02",
        consent: "withdrawn",
        sources: [
          {
            key: "nadia_site",
            kind: "personal_website",
            title: "nadia-hassan.example",
            url: "https://nadia-hassan.example",
            policy: "allowed",
            excerpt: "Illustrator.",
          },
        ],
        candidates: [
          {
            key: "nadia_c1",
            label: "Nadia Hassan — illustrator, Amman",
            name: "Nadia Hassan",
            location: "Amman",
            language: "ar",
            profession: "illustrator",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "nadia_site", category: "creative_projects", excerpt: "Illustration work.", actionable: true },
        ],
        expect: { expectRefused: true, expectBrief: false },
      },
    ],
  },
  {
    key: "multi_guest_mixed_consent",
    title: "8 · Multi-guest booking, mixed consent",
    description: "Two guests in one booking. Only the consenting guest is researched; the other is refused.",
    subjects: [
      {
        profile: {
          fullName: "Clara Vance",
          email: "clara.vance@sim.local",
          language: "en",
          country: "GB",
          location: "Bristol",
          profession: "landscape designer",
        },
        stayUnitName: "Villa Basalt 03",
        consent: "granted",
        sources: [
          {
            key: "clara_site",
            kind: "personal_website",
            title: "clara-vance.example",
            url: "https://clara-vance.example",
            policy: "allowed",
            excerpt: "Landscape designer; native planting.",
          },
        ],
        candidates: [
          {
            key: "clara_c1",
            label: "Clara Vance — landscape designer, Bristol",
            name: "Clara Vance",
            location: "Bristol",
            language: "en",
            profession: "landscape designer",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "clara_site", category: "nature", excerpt: "Native planting and quiet gardens.", actionable: true },
        ],
        expect: { expectBrief: true, expectConfidence: "high", minBriefItems: 1 },
      },
      {
        profile: {
          fullName: "Daniel Vance",
          email: "daniel.vance@sim.local",
          language: "en",
          country: "GB",
          location: "Bristol",
          profession: "teacher",
        },
        stayUnitName: "Villa Basalt 03",
        consent: "none",
        sources: [],
        candidates: [],
        evidence: [],
        expect: { expectRefused: true, expectBrief: false },
      },
    ],
  },
  {
    key: "non_actionable_context",
    title: "9 · Relevant but non-actionable context",
    description: "High-confidence identity with relevant context that doesn't translate to a concrete preparation. Brief shows context only.",
    subjects: [
      {
        profile: {
          fullName: "Yusuf Demir",
          email: "yusuf.demir@sim.local",
          language: "tr",
          country: "TR",
          location: "Istanbul",
          profession: "writer",
        },
        stayUnitName: "Stone Cabin 05",
        consent: "granted",
        sources: [
          {
            key: "yusuf_bio",
            kind: "official_bio",
            title: "Publisher author page",
            url: "https://publisher.example/yusuf",
            policy: "allowed",
            excerpt: "Writer with interest in local culture.",
          },
        ],
        candidates: [
          {
            key: "yusuf_c1",
            label: "Yusuf Demir — writer, Istanbul",
            name: "Yusuf Demir",
            location: "Istanbul",
            language: "tr",
            profession: "writer",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "yusuf_bio", category: "local_culture", excerpt: "Enjoys local cultural history.", actionable: false },
          { sourceKey: "yusuf_bio", category: "professional_projects", excerpt: "Recently published a book.", actionable: false },
        ],
        expect: { expectBrief: true, expectConfidence: "high", minBriefItems: 1 },
      },
    ],
  },
  {
    key: "actionable_preparation",
    title: "10 · Relevant context → useful preparation",
    description: "High-confidence identity with actionable context that yields concrete host preparations.",
    subjects: [
      {
        profile: {
          fullName: "Greta Hofer",
          email: "greta.hofer@sim.local",
          language: "de",
          country: "AT",
          location: "Innsbruck",
          profession: "architect",
        },
        stayUnitName: "Ocean Cabin 02",
        consent: "granted",
        sources: [
          {
            key: "greta_site",
            kind: "personal_website",
            title: "greta-hofer.example",
            url: "https://greta-hofer.example",
            policy: "allowed",
            excerpt: "Architect; alpine timber projects.",
          },
          {
            key: "greta_interview",
            kind: "interview",
            title: "Mountain Living — interview",
            url: "https://mountain-living.example/greta",
            policy: "allowed",
            excerpt: "Loves quiet sunrise hikes and simple local food.",
          },
        ],
        candidates: [
          {
            key: "greta_c1",
            label: "Greta Hofer — architect, Innsbruck",
            name: "Greta Hofer",
            location: "Innsbruck",
            language: "de",
            profession: "architect",
            explicitMarker: true,
          },
        ],
        evidence: [
          { sourceKey: "greta_site", category: "architecture", excerpt: "Alpine timber architecture.", actionable: true },
          { sourceKey: "greta_interview", category: "hiking", excerpt: "Quiet sunrise hikes.", actionable: true },
          { sourceKey: "greta_interview", category: "food", excerpt: "Simple local food.", actionable: true },
        ],
        expect: { expectBrief: true, expectConfidence: "high", minBriefItems: 3 },
      },
    ],
  },
];

export function getScenario(key: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.key === key);
}

// Stable list of all simulated subjects for seeding.
export function allSubjects(): { scenarioKey: string; subject: SubjectFixture }[] {
  return SCENARIOS.flatMap((s) => s.subjects.map((subject) => ({ scenarioKey: s.key, subject })));
}
