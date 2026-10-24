/**
 * Where to actually learn each skill.
 *
 * The study plan says "two hours on hashing" and then leaves the student to
 * find the material themselves, which is the point at which most of them stop.
 * This closes that, with two hard rules.
 *
 * **No invented links.** Every URL here is hand-written and points at a
 * canonical documentation root — the kind of address that has been stable for
 * years and is unlikely to rot. Nothing is generated, scraped or guessed. A
 * plausible-looking URL that 404s is worse than no link, because the student
 * spends the trust before discovering it.
 *
 * **"Official" means official.** A resource may only carry `kind: "official"`
 * when its host belongs to the project or vendor that owns the technology, and
 * `OFFICIAL_HOSTS` below is asserted against in the tests. Calling a good blog
 * post "the official documentation" is a small lie that makes every other
 * label untrustworthy.
 *
 * The `focus` notes are original, written for this product. They are not
 * extracted from any course or book, and they are deliberately short: what to
 * look for in a topic, not a substitute for the material itself.
 */

export type ResourceKind = "official" | "reference" | "practice";

export interface LearningResource {
  title: string;
  url: string;
  kind: ResourceKind;
  /** Why this one, in a sentence. */
  note: string;
}

export interface SkillGuide {
  /** Original guidance on what to actually cover. Not sourced from anywhere. */
  focus: string[];
  resources: LearningResource[];
}

/**
 * Hosts allowed to carry `kind: "official"`, by the technology they own.
 * The test suite asserts every official resource matches one of these.
 */
export const OFFICIAL_HOSTS = [
  "docs.python.org",
  "docs.oracle.com",
  "developer.mozilla.org",
  "www.typescriptlang.org",
  "react.dev",
  "nodejs.org",
  "go.dev",
  "kotlinlang.org",
  "docs.docker.com",
  "kubernetes.io",
  "git-scm.com",
  "www.postgresql.org",
  "www.mongodb.com",
  "spring.io",
  "docs.djangoproject.com",
  "learn.microsoft.com",
  "docs.aws.amazon.com",
  "www.kernel.org",
  "angular.dev",
  "vuejs.org",
  "graphql.org",
  "www.docker.com",
] as const;

/**
 * MDN is the reference the whole web industry treats as canonical for web
 * platform APIs, and Mozilla publishes it — so it is official for HTML, CSS
 * and JavaScript, and a `reference` anywhere else.
 */
const GUIDES: Record<string, SkillGuide> = {
  dsa: {
    focus: [
      "Arrays, strings, hash maps and the two-pointer and sliding-window patterns — these carry most online assessments.",
      "Trees and graphs: traversal, shortest path, and knowing which one a problem is really asking for.",
      "Sorting and binary search, including binary search on an answer rather than an index.",
      "Be able to state the time and space cost of what you wrote, out loud, without being asked.",
    ],
    resources: [],
  },
  complexity: {
    focus: [
      "Reading a loop nest and naming its cost without counting operations.",
      "Amortised cost — why a dynamic array's push is O(1) despite occasional copying.",
      "Space cost of recursion: the call stack is memory you are spending.",
    ],
    resources: [],
  },
  oops: {
    focus: [
      "Encapsulation and why a public field is a decision you cannot take back.",
      "Composition against inheritance, and when inheritance actually earns its place.",
      "Polymorphism and interfaces — the thing interviewers probe with 'how would you extend this'.",
      "SOLID as a vocabulary for explaining a design, not a checklist to recite.",
    ],
    resources: [],
  },
  java: {
    focus: [
      "Collections: when to reach for ArrayList against LinkedList, HashMap against TreeMap.",
      "Generics and the reason `List<Object>` is not a `List<String>`.",
      "Exceptions, try-with-resources, and what `finally` does to a return.",
      "Streams and lambdas — increasingly expected, and easy to misuse.",
    ],
    resources: [
      {
        title: "Java SE documentation",
        url: "https://docs.oracle.com/en/java/javase/",
        kind: "official",
        note: "Oracle's own API and language documentation. The authority for what a method actually does.",
      },
    ],
  },
  python: {
    focus: [
      "Lists, dicts, sets and tuples — and which one a problem wants.",
      "Comprehensions, generators, and the memory difference between them.",
      "Mutable default arguments and the other sharp edges that come up in interviews.",
      "The standard library: `collections`, `itertools` and `heapq` solve more than people expect.",
    ],
    resources: [
      {
        title: "The Python documentation",
        url: "https://docs.python.org/3/",
        kind: "official",
        note: "The language reference, tutorial and standard library, from the Python project itself.",
      },
    ],
  },
  cpp: {
    focus: [
      "The STL: vector, map, set, and the algorithms header.",
      "References against pointers, and what a copy actually costs.",
      "RAII and why destructors are the language's main idea.",
    ],
    resources: [],
  },
  javascript: {
    focus: [
      "Closures, `this`, and prototype lookup — the three things interviews probe.",
      "Promises, async/await and the event loop's ordering.",
      "Array methods, destructuring and spread, which modern code assumes you read fluently.",
    ],
    resources: [
      {
        title: "MDN JavaScript guide",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
        kind: "official",
        note: "Mozilla's reference for the language. The web platform's canonical documentation.",
      },
    ],
  },
  typescript: {
    focus: [
      "Structural typing — why a shape that fits is accepted.",
      "Unions, narrowing and discriminated unions, which is where the value is.",
      "Generics, and knowing when a type is doing real work rather than decoration.",
    ],
    resources: [
      {
        title: "TypeScript handbook",
        url: "https://www.typescriptlang.org/docs/",
        kind: "official",
        note: "The language's own handbook, from the TypeScript team.",
      },
    ],
  },
  html_css: {
    focus: [
      "The box model, flexbox and grid — most layout questions are one of these three.",
      "Specificity and the cascade, which is what people actually get wrong.",
      "Semantic elements, which are also the foundation of accessibility.",
    ],
    resources: [
      {
        title: "MDN CSS reference",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS",
        kind: "official",
        note: "Mozilla's CSS documentation, including layout guides.",
      },
    ],
  },
  react: {
    focus: [
      "State and props, and why rendering is a function of them.",
      "The rules of hooks, and effects as synchronisation rather than lifecycle.",
      "Keys in lists, and what a wrong key silently breaks.",
    ],
    resources: [
      {
        title: "React documentation",
        url: "https://react.dev/learn",
        kind: "official",
        note: "The React team's own guide, rewritten around hooks.",
      },
    ],
  },
  node: {
    focus: [
      "The event loop and why blocking it stops everything.",
      "Modules, streams and the filesystem API.",
      "Error handling across callbacks, promises and async/await.",
    ],
    resources: [
      {
        title: "Node.js documentation",
        url: "https://nodejs.org/docs/latest/api/",
        kind: "official",
        note: "The API reference from the Node.js project.",
      },
    ],
  },
  sql: {
    focus: [
      "Joins — inner, left, and what a missing join condition does to row counts.",
      "GROUP BY with HAVING, and the difference from WHERE.",
      "Indexes: what they speed up, and what they cost on write.",
      "Window functions, which increasingly appear in assessments.",
    ],
    resources: [
      {
        title: "PostgreSQL documentation",
        url: "https://www.postgresql.org/docs/current/",
        kind: "official",
        note: "Thorough and standards-focused; useful even if you will be writing MySQL.",
      },
    ],
  },
  dbms: {
    focus: [
      "Normalisation up to 3NF, and when denormalising is the right call.",
      "ACID, isolation levels, and the anomaly each level still permits.",
      "Indexing and query planning — how the database decides what to do.",
    ],
    resources: [],
  },
  nosql: {
    focus: [
      "Document modelling: embedding against referencing, and what each costs to read.",
      "Why a schema still exists even when the database does not enforce one.",
      "Indexes and the queries they are built for.",
    ],
    resources: [
      {
        title: "MongoDB manual",
        url: "https://www.mongodb.com/docs/manual/",
        kind: "official",
        note: "Data modelling and query documentation from MongoDB.",
      },
    ],
  },
  os: {
    focus: [
      "Processes against threads, and context switching.",
      "Deadlock: the four conditions, and how to argue one away.",
      "Virtual memory, paging and why a cache miss is expensive.",
      "Scheduling algorithms and their trade-offs.",
    ],
    resources: [],
  },
  networks: {
    focus: [
      "TCP against UDP, and the handshake.",
      "What actually happens between typing a URL and seeing a page — a perennial interview question.",
      "HTTP methods, status codes, and what makes a request idempotent.",
      "DNS, and TLS at a level you can explain.",
    ],
    resources: [
      {
        title: "MDN HTTP documentation",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP",
        kind: "official",
        note: "Methods, status codes, headers and caching, from Mozilla.",
      },
    ],
  },
  system_design: {
    focus: [
      "Start from requirements and scale estimates, not from a diagram.",
      "Load balancing, caching, replication and sharding — and the cost each adds.",
      "Consistency against availability in terms of a specific failure, not an acronym.",
      "Be able to say what you would measure to know the design is working.",
    ],
    resources: [],
  },
  rest: {
    focus: [
      "Resource modelling and choosing a method that matches the intent.",
      "Status codes that distinguish a client error from a server fault.",
      "Idempotency, pagination and versioning.",
    ],
    resources: [
      {
        title: "MDN HTTP methods",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods",
        kind: "official",
        note: "What each method means and which are safe or idempotent.",
      },
    ],
  },
  git: {
    focus: [
      "Branching, merging and what a rebase rewrites.",
      "Reading a conflict and resolving it deliberately.",
      "What is in the index against the working tree against a commit.",
    ],
    resources: [
      {
        title: "Pro Git",
        url: "https://git-scm.com/book/en/v2",
        kind: "official",
        note: "The book published by the Git project, free to read in full.",
      },
    ],
  },
  docker: {
    focus: [
      "Images against containers, and what a layer is.",
      "Writing a Dockerfile that caches well.",
      "Volumes, networking and why a container's filesystem is ephemeral.",
    ],
    resources: [
      {
        title: "Docker documentation",
        url: "https://docs.docker.com/",
        kind: "official",
        note: "Getting started, Dockerfile reference and best practices from Docker.",
      },
    ],
  },
  kubernetes: {
    focus: [
      "Pods, deployments and services, and what each is actually for.",
      "Declarative configuration and the reconciliation loop.",
      "Resource limits, and what happens when a pod exceeds them.",
    ],
    resources: [
      {
        title: "Kubernetes documentation",
        url: "https://kubernetes.io/docs/home/",
        kind: "official",
        note: "Concepts and tutorials from the Kubernetes project.",
      },
    ],
  },
  linux: {
    focus: [
      "Navigating and inspecting a filesystem without a GUI.",
      "Pipes and redirection, and composing small tools.",
      "Permissions, processes and reading logs.",
    ],
    resources: [],
  },
  spring: {
    focus: [
      "Dependency injection, and why the container exists.",
      "Building a REST controller and mapping requests.",
      "Configuration, profiles and what auto-configuration decided for you.",
    ],
    resources: [
      {
        title: "Spring guides",
        url: "https://spring.io/guides",
        kind: "official",
        note: "Short task-focused guides published by the Spring project.",
      },
    ],
  },
  django: {
    focus: [
      "Models, migrations and the ORM's query semantics.",
      "Views, URLs and templates.",
      "What the admin gives you, and its limits.",
    ],
    resources: [
      {
        title: "Django documentation",
        url: "https://docs.djangoproject.com/en/stable/",
        kind: "official",
        note: "The tutorial and topic guides from the Django project.",
      },
    ],
  },
  go: {
    focus: [
      "Goroutines and channels, and when a mutex is the simpler answer.",
      "Interfaces, satisfied implicitly.",
      "Errors as values, and the habit of handling them where they happen.",
    ],
    resources: [
      {
        title: "Go documentation",
        url: "https://go.dev/doc/",
        kind: "official",
        note: "The tour, effective Go, and the standard library reference.",
      },
    ],
  },
  problem_solving: {
    focus: [
      "Restate the problem and the constraints before writing anything.",
      "Work a small example by hand — most wrong solutions are visible there.",
      "Say your approach and its cost out loud before coding it.",
      "Test the edges: empty, one element, duplicates, the maximum size.",
    ],
    resources: [],
  },
  testing: {
    focus: [
      "What makes a test worth keeping: it fails for one reason, and that reason is a real defect.",
      "Arrange, act, assert — and one behaviour per test.",
      "Test doubles, and the cost of mocking something you own.",
    ],
    resources: [],
  },
};

/**
 * Guidance for a skill, or null when none is curated.
 *
 * Returning null rather than a generic filler matters: "read the docs and
 * practise" dressed up as advice wastes the student's attention and teaches
 * them to skim this section.
 */
export function guideFor(skillId: string): SkillGuide | null {
  const guide = GUIDES[skillId];
  if (!guide) return null;
  if (guide.focus.length === 0 && guide.resources.length === 0) return null;
  return guide;
}

/** Every curated guide, for the tests that police the rules above. */
export function allGuides(): [string, SkillGuide][] {
  return Object.entries(GUIDES);
}
