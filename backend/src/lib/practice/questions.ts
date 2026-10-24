/**
 * The practice question bank.
 *
 * Hand-written, mapped onto the same skill ids the taxonomy and the gap
 * analysis already use, so a weak result here points at a real gap rather
 * than at a category invented for the quiz.
 *
 * Every question carries an explanation, because the point of practice is not
 * the score. A student who gets one wrong and is told only "incorrect" has
 * learned nothing; the explanation is the actual deliverable and the mark is
 * just how we decide which ones to show them.
 *
 * `answer` never leaves this process. The API serves questions with the
 * options shuffled out of this shape and the key stripped — see
 * `publicQuestion`. A quiz that ships its own answer key is not an assessment,
 * it is a form.
 */

export type QuestionFormat = "mcq";

export interface Question {
  id: string;
  skillId: string;
  format: QuestionFormat;
  prompt: string;
  options: string[];
  /** Index into `options`. Server-side only. */
  answer: number;
  explanation: string;
  /** Roughly how hard, for picking a spread rather than all easy ones. */
  level: "basic" | "intermediate";
}

export const QUESTIONS: Question[] = [
  // --- Data structures & algorithms -----------------------------------------
  {
    id: "dsa-1",
    skillId: "dsa",
    format: "mcq",
    prompt:
      "You need to find whether any value appears twice in an unsorted array of n integers. What is the best average-case time you can achieve, and with what?",
    options: [
      "O(n) using a hash set",
      "O(n log n) — you must sort first",
      "O(n²) comparing every pair",
      "O(log n) using binary search",
    ],
    answer: 0,
    explanation:
      "One pass, adding each value to a hash set and checking membership first, is O(n) on average. Sorting first would work but costs O(n log n). Binary search needs sorted data and does not answer this question.",
    level: "basic",
  },
  {
    id: "dsa-2",
    skillId: "dsa",
    format: "mcq",
    prompt: "What is the worst-case time complexity of a lookup in a hash map?",
    options: ["O(n)", "O(1)", "O(log n)", "O(n log n)"],
    answer: 0,
    explanation:
      "O(1) is the average case. In the worst case every key collides into one bucket and the lookup degrades to scanning a list, which is O(n). Interviewers ask this precisely because the average is quoted so often that the worst case is forgotten.",
    level: "intermediate",
  },
  {
    id: "dsa-3",
    skillId: "dsa",
    format: "mcq",
    prompt:
      "You are asked for the shortest path in an unweighted graph. Which traversal gives it directly?",
    options: [
      "Breadth-first search",
      "Depth-first search",
      "Either, they give the same path",
      "Neither — you need Dijkstra's algorithm",
    ],
    answer: 0,
    explanation:
      "BFS visits vertices in order of distance from the source, so the first time it reaches a vertex it has done so by a shortest path. DFS may reach it by a long detour. Dijkstra generalises this to weighted edges, which is more machinery than an unweighted graph needs.",
    level: "basic",
  },
  {
    id: "dsa-4",
    skillId: "dsa",
    format: "mcq",
    prompt:
      "Binary search is usually described as searching a sorted array. What is the other common use interviewers look for?",
    options: [
      "Searching over the answer space of a monotonic predicate",
      "Searching a linked list in O(log n)",
      "Searching an unsorted array if you know the maximum",
      "Searching a hash table more quickly",
    ],
    answer: 0,
    explanation:
      "\"Binary search on the answer\" applies whenever a predicate is false up to some threshold and true after it — minimum capacity, minimum time, smallest feasible value. A linked list cannot be binary searched because it has no random access.",
    level: "intermediate",
  },

  // --- SQL ------------------------------------------------------------------
  {
    id: "sql-1",
    skillId: "sql",
    format: "mcq",
    prompt:
      "Orders has 100 rows; 20 of them have a customer_id matching no row in Customers. How many rows does `SELECT * FROM Orders o INNER JOIN Customers c ON o.customer_id = c.id` return?",
    options: ["80", "100", "120", "20"],
    answer: 0,
    explanation:
      "An inner join keeps only rows with a match on both sides, so the 20 unmatched orders are dropped and 80 remain. A LEFT JOIN would keep all 100, filling the customer columns with NULL for those 20.",
    level: "basic",
  },
  {
    id: "sql-2",
    skillId: "sql",
    format: "mcq",
    prompt: "What is the difference between WHERE and HAVING?",
    options: [
      "WHERE filters rows before grouping; HAVING filters groups after",
      "They are interchangeable",
      "HAVING filters rows; WHERE filters columns",
      "WHERE works only on indexed columns",
    ],
    answer: 0,
    explanation:
      "WHERE is applied before GROUP BY, so it cannot see aggregates. HAVING is applied to the grouped result, so it can — `HAVING COUNT(*) > 5` is valid where `WHERE COUNT(*) > 5` is not.",
    level: "basic",
  },
  {
    id: "sql-3",
    skillId: "sql",
    format: "mcq",
    prompt: "Adding an index to a column speeds up reads. What does it cost?",
    options: [
      "Slower writes and extra storage, since the index must be maintained",
      "Nothing — indexes are free",
      "Only extra storage; writes are unaffected",
      "It makes the table read-only",
    ],
    answer: 0,
    explanation:
      "Every insert, update or delete has to update the index as well as the table, so writes get slower and the index occupies disk. That trade is why you index the columns you filter and join on, not every column.",
    level: "intermediate",
  },
  {
    id: "sql-4",
    skillId: "sql",
    format: "mcq",
    prompt: "What does `COUNT(column_name)` do with NULLs in that column?",
    options: [
      "Skips them — only non-NULL values are counted",
      "Counts them as zero",
      "Counts them like any other value",
      "Raises an error",
    ],
    answer: 0,
    explanation:
      "COUNT(column) ignores NULLs, while COUNT(*) counts rows regardless. The difference between the two is a standard way to find how many values are missing in a column.",
    level: "intermediate",
  },

  // --- Operating systems ----------------------------------------------------
  {
    id: "os-1",
    skillId: "os",
    format: "mcq",
    prompt: "What distinguishes a process from a thread?",
    options: [
      "Processes have separate address spaces; threads of one process share it",
      "Threads are always faster than processes",
      "A process can have only one thread",
      "Threads cannot run in parallel",
    ],
    answer: 0,
    explanation:
      "Each process gets its own memory, so a fault in one cannot corrupt another. Threads inside a process share that memory, which makes communication cheap and is also exactly why they need synchronisation.",
    level: "basic",
  },
  {
    id: "os-2",
    skillId: "os",
    format: "mcq",
    prompt: "Which set of conditions must ALL hold for a deadlock to be possible?",
    options: [
      "Mutual exclusion, hold and wait, no preemption, circular wait",
      "Mutual exclusion and starvation",
      "Context switching and paging",
      "Race conditions and busy waiting",
    ],
    answer: 0,
    explanation:
      "These are Coffman's four conditions. Because all four are necessary, deadlock prevention works by breaking any one of them — for instance imposing a global lock ordering, which eliminates circular wait.",
    level: "intermediate",
  },
  {
    id: "os-3",
    skillId: "os",
    format: "mcq",
    prompt: "What is thrashing?",
    options: [
      "The system spends more time paging than executing",
      "Two threads deadlock on the same mutex",
      "The CPU runs at full utilisation",
      "A process is starved by the scheduler",
    ],
    answer: 0,
    explanation:
      "When the working set does not fit in physical memory, every access faults, and the system does little but swap pages. CPU utilisation collapses even though the CPU is not idle in the usual sense.",
    level: "intermediate",
  },

  // --- Computer networks ----------------------------------------------------
  {
    id: "networks-1",
    skillId: "networks",
    format: "mcq",
    prompt: "What does TCP give you that UDP does not?",
    options: [
      "Ordered, reliable delivery with retransmission and flow control",
      "Lower latency",
      "Encryption",
      "A smaller header",
    ],
    answer: 0,
    explanation:
      "TCP acknowledges and retransmits, orders segments and controls flow and congestion. UDP gives none of that, which is exactly why it is lighter and preferred for live audio or video where a late packet is worth less than a dropped one. Neither encrypts — that is TLS.",
    level: "basic",
  },
  {
    id: "networks-2",
    skillId: "networks",
    format: "mcq",
    prompt: "In the TCP three-way handshake, what are the three segments?",
    options: ["SYN, SYN-ACK, ACK", "SYN, ACK, FIN", "GET, 200, ACK", "ACK, SYN, ACK"],
    answer: 0,
    explanation:
      "The client sends SYN, the server replies SYN-ACK, the client answers ACK. Three segments are needed because both directions must agree on an initial sequence number, and each direction needs acknowledging.",
    level: "basic",
  },
  {
    id: "networks-3",
    skillId: "networks",
    format: "mcq",
    prompt: "What does DNS actually do?",
    options: [
      "Resolves a domain name to an IP address",
      "Encrypts traffic between browser and server",
      "Routes packets between networks",
      "Assigns an IP address to a device joining a network",
    ],
    answer: 0,
    explanation:
      "DNS is name resolution. Routing is IP's job, encryption is TLS's, and handing out addresses on a local network is DHCP's. Interviewers often ask this chain as \"what happens when you type a URL\".",
    level: "basic",
  },

  // --- DBMS -----------------------------------------------------------------
  {
    id: "dbms-1",
    skillId: "dbms",
    format: "mcq",
    prompt: "What does the 'I' in ACID guarantee?",
    options: [
      "Concurrent transactions do not see each other's partial state",
      "Each transaction is written to disk immediately",
      "The database never loses data",
      "Every table has a primary key",
    ],
    answer: 0,
    explanation:
      "Isolation means a transaction in progress is invisible to others, so interleaved transactions produce a result consistent with some serial order. Durability is the one about surviving a crash.",
    level: "intermediate",
  },
  {
    id: "dbms-2",
    skillId: "dbms",
    format: "mcq",
    prompt: "Why normalise a schema?",
    options: [
      "To remove redundancy so one fact is stored in one place",
      "To make every query faster",
      "To reduce the number of tables",
      "To avoid needing indexes",
    ],
    answer: 0,
    explanation:
      "Normalisation eliminates duplicate storage of the same fact, which is what prevents update anomalies. It usually means more tables and more joins, so it can make reads slower — denormalisation is the deliberate trade back.",
    level: "intermediate",
  },

  // --- OOPS -----------------------------------------------------------------
  {
    id: "oops-1",
    skillId: "oops",
    format: "mcq",
    prompt: "What is the difference between method overloading and overriding?",
    options: [
      "Overloading is same name, different parameters, resolved at compile time; overriding replaces a superclass method at run time",
      "They are two names for the same thing",
      "Overloading happens across classes; overriding within one class",
      "Overriding requires the methods to have different parameters",
    ],
    answer: 0,
    explanation:
      "Overloading is resolved by the compiler from the argument types. Overriding is resolved at run time by the actual object's type, which is what makes polymorphism work — and it requires the same signature, not a different one.",
    level: "basic",
  },
  {
    id: "oops-2",
    skillId: "oops",
    format: "mcq",
    prompt: "What does encapsulation actually buy you?",
    options: [
      "Internal state can change without breaking callers, because they go through an interface",
      "Faster execution",
      "Less memory used per object",
      "Automatic thread safety",
    ],
    answer: 0,
    explanation:
      "Hiding the representation means you can change it later. It is not a performance feature and it certainly is not thread safety — a private field is just as racy as a public one.",
    level: "basic",
  },

  // --- Java -----------------------------------------------------------------
  {
    id: "java-1",
    skillId: "java",
    format: "mcq",
    prompt: "In Java, `==` on two String variables compares what?",
    options: [
      "Whether they refer to the same object",
      "Whether their characters are equal",
      "Their lengths",
      "Their hash codes",
    ],
    answer: 0,
    explanation:
      "`==` compares references. `.equals()` compares contents. Literals are interned so `\"a\" == \"a\"` happens to be true, which is why this bug survives testing and then fails on a string built at run time.",
    level: "basic",
  },
  {
    id: "java-2",
    skillId: "java",
    format: "mcq",
    prompt: "If you override `equals()` in Java, what else must you override?",
    options: [
      "`hashCode()`",
      "`toString()`",
      "`clone()`",
      "Nothing else is required",
    ],
    answer: 0,
    explanation:
      "Objects that are equal must have equal hash codes, or hash-based collections break: a HashMap will fail to find a key that equals one it is storing. Overriding one without the other is a classic interview trap.",
    level: "intermediate",
  },
];

/** A question as the client is allowed to see it — no answer key. */
export interface PublicQuestion {
  id: string;
  skillId: string;
  format: QuestionFormat;
  prompt: string;
  options: string[];
}

export function publicQuestion(question: Question): PublicQuestion {
  // Destructured so a future field cannot leak by being forgotten here: the
  // answer and explanation are named and dropped, and everything else is
  // listed explicitly rather than spread.
  return {
    id: question.id,
    skillId: question.skillId,
    format: question.format,
    prompt: question.prompt,
    options: question.options,
  };
}

/** Which skills have enough questions to be worth offering. */
export function assessableSkills(minimum = 2): string[] {
  const counts = new Map<string, number>();
  for (const q of QUESTIONS) counts.set(q.skillId, (counts.get(q.skillId) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= minimum)
    .map(([skillId]) => skillId)
    .sort();
}

export function questionsFor(skillId: string): Question[] {
  return QUESTIONS.filter((q) => q.skillId === skillId);
}

export function questionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id);
}
