/**
 * The skill vocabulary the analyser recognises.
 *
 * Deliberately a curated list rather than "any capitalised word": a notice
 * saying "work with the Payments team in Bengaluru" should not produce
 * "Payments" and "Bengaluru" as skills to study. Precision matters more than
 * recall here, because every false skill becomes a study task the student
 * wastes an evening on.
 *
 * `implies` encodes the few relationships that are genuinely safe — React is
 * JavaScript, Django is Python — and those are reported as *inferred*, never
 * mixed in with what the job description actually said.
 */

export type SkillCategory =
  | "language"
  | "cs_fundamentals"
  | "web"
  | "data"
  | "systems"
  | "tooling"
  | "cloud"
  | "mobile"
  | "testing"
  | "practice";

export interface SkillDefinition {
  /** Stable slug. Used as the id everywhere downstream. */
  id: string;
  label: string;
  category: SkillCategory;
  /**
   * Matched case-insensitively on word boundaries. Order does not matter;
   * the longest match wins so "spring boot" beats "spring".
   */
  aliases: string[];
  /** Skills this one safely implies. Reported separately, as inferred. */
  implies?: string[];
}

export const SKILLS: SkillDefinition[] = [
  // --- Languages ----------------------------------------------------------
  { id: "java", label: "Java", category: "language", aliases: ["java", "core java", "java 8", "java8"] },
  { id: "python", label: "Python", category: "language", aliases: ["python", "python3", "py"] },
  { id: "cpp", label: "C++", category: "language", aliases: ["c++", "cpp"] },
  { id: "c", label: "C", category: "language", aliases: ["c language", "ansi c"] },
  { id: "csharp", label: "C#", category: "language", aliases: ["c#", "c sharp", "csharp"] },
  { id: "javascript", label: "JavaScript", category: "language", aliases: ["javascript", "js", "es6", "ecmascript"] },
  { id: "typescript", label: "TypeScript", category: "language", aliases: ["typescript", "ts"], implies: ["javascript"] },
  { id: "go", label: "Go", category: "language", aliases: ["golang", "go lang"] },
  { id: "kotlin", label: "Kotlin", category: "language", aliases: ["kotlin"] },
  { id: "swift", label: "Swift", category: "language", aliases: ["swift"] },
  { id: "scala", label: "Scala", category: "language", aliases: ["scala"] },
  { id: "ruby", label: "Ruby", category: "language", aliases: ["ruby"] },
  { id: "php", label: "PHP", category: "language", aliases: ["php"] },
  { id: "r", label: "R", category: "language", aliases: ["r programming"] },

  // --- CS fundamentals ----------------------------------------------------
  { id: "dsa", label: "Data structures & algorithms", category: "cs_fundamentals", aliases: ["data structures", "dsa", "algorithms", "data structure", "ds and algorithms", "ds & algorithms"] },
  { id: "oops", label: "Object-oriented programming", category: "cs_fundamentals", aliases: ["oop", "oops", "object oriented", "object-oriented"] },
  { id: "os", label: "Operating systems", category: "cs_fundamentals", aliases: ["operating system", "operating systems", "os concepts"] },
  { id: "dbms", label: "Database management systems", category: "cs_fundamentals", aliases: ["dbms", "database management", "rdbms"] },
  { id: "networks", label: "Computer networks", category: "cs_fundamentals", aliases: ["computer networks", "networking", "tcp/ip", "osi model"] },
  { id: "complexity", label: "Time & space complexity", category: "cs_fundamentals", aliases: ["time complexity", "space complexity", "big o", "big-o"] },
  { id: "problem_solving", label: "Problem solving", category: "practice", aliases: ["problem solving", "problem-solving", "analytical skills", "logical reasoning", "aptitude"] },

  // --- Web ----------------------------------------------------------------
  { id: "react", label: "React", category: "web", aliases: ["react", "react.js", "reactjs"], implies: ["javascript"] },
  { id: "angular", label: "Angular", category: "web", aliases: ["angular", "angularjs"], implies: ["typescript"] },
  { id: "vue", label: "Vue", category: "web", aliases: ["vue", "vue.js", "vuejs"], implies: ["javascript"] },
  { id: "node", label: "Node.js", category: "web", aliases: ["node", "node.js", "nodejs"], implies: ["javascript"] },
  { id: "html_css", label: "HTML & CSS", category: "web", aliases: ["html", "css", "html5", "css3", "scss", "sass", "tailwind"] },
  { id: "rest", label: "REST APIs", category: "web", aliases: ["rest", "rest api", "restful", "api design"] },
  { id: "graphql", label: "GraphQL", category: "web", aliases: ["graphql"] },
  { id: "spring", label: "Spring / Spring Boot", category: "web", aliases: ["spring", "spring boot", "springboot"], implies: ["java"] },
  { id: "django", label: "Django", category: "web", aliases: ["django"], implies: ["python"] },
  { id: "flask", label: "Flask", category: "web", aliases: ["flask"], implies: ["python"] },
  { id: "dotnet", label: ".NET", category: "web", aliases: [".net", "dotnet", "asp.net"], implies: ["csharp"] },

  // --- Data ---------------------------------------------------------------
  { id: "sql", label: "SQL", category: "data", aliases: ["sql", "mysql", "postgresql", "postgres", "oracle db", "plsql", "pl/sql"] },
  { id: "nosql", label: "NoSQL", category: "data", aliases: ["nosql", "mongodb", "cassandra", "dynamodb", "redis"] },
  { id: "data_analysis", label: "Data analysis", category: "data", aliases: ["data analysis", "data analytics", "pandas", "numpy"] },
  { id: "ml", label: "Machine learning", category: "data", aliases: ["machine learning", "ml", "deep learning", "tensorflow", "pytorch", "scikit-learn"] },
  { id: "big_data", label: "Big data", category: "data", aliases: ["hadoop", "spark", "kafka", "big data"] },

  // --- Systems / cloud / tooling -----------------------------------------
  { id: "system_design", label: "System design", category: "systems", aliases: ["system design", "scalability", "distributed systems", "high availability", "low level design", "high level design"] },
  { id: "microservices", label: "Microservices", category: "systems", aliases: ["microservice", "microservices"] },
  { id: "linux", label: "Linux", category: "systems", aliases: ["linux", "unix", "shell scripting", "bash"] },
  { id: "git", label: "Git", category: "tooling", aliases: ["git", "github", "gitlab", "version control"] },
  { id: "docker", label: "Docker", category: "cloud", aliases: ["docker", "containerization", "containerisation"] },
  { id: "kubernetes", label: "Kubernetes", category: "cloud", aliases: ["kubernetes", "k8s"] },
  { id: "aws", label: "AWS", category: "cloud", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"] },
  { id: "azure", label: "Azure", category: "cloud", aliases: ["azure"] },
  { id: "gcp", label: "Google Cloud", category: "cloud", aliases: ["gcp", "google cloud"] },
  { id: "cicd", label: "CI/CD", category: "tooling", aliases: ["ci/cd", "cicd", "jenkins", "continuous integration"] },

  // --- Mobile -------------------------------------------------------------
  { id: "android", label: "Android", category: "mobile", aliases: ["android"] },
  { id: "ios", label: "iOS", category: "mobile", aliases: ["ios"] },
  { id: "react_native", label: "React Native", category: "mobile", aliases: ["react native"], implies: ["react"] },
  { id: "flutter", label: "Flutter", category: "mobile", aliases: ["flutter", "dart"] },

  // --- Testing ------------------------------------------------------------
  { id: "testing", label: "Testing", category: "testing", aliases: ["unit testing", "unit test", "test driven", "tdd", "junit", "jest", "selenium", "automation testing"] },
  { id: "debugging", label: "Debugging", category: "testing", aliases: ["debugging", "troubleshooting"] },
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function skillById(id: string): SkillDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Aliases longest-first, so "spring boot" is matched before "spring" and
 * "react native" before "react". Without this a longer skill is shadowed by
 * the shorter one it contains.
 */
export const ALIASES_LONGEST_FIRST: { alias: string; skill: SkillDefinition }[] = SKILLS.flatMap(
  (skill) => skill.aliases.map((alias) => ({ alias: alias.toLowerCase(), skill })),
).sort((a, b) => b.alias.length - a.alias.length);
