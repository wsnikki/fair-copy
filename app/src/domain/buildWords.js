// [A] How every screen, the record page and the tools say which build a release was tested on. Pure.
// A build set on the release is "the build being accepted" (S5 then applies, SPEC §2.11). When none is set the words
// say what WAS tested, from the latest run of each case: "Builds tested: 2.4.0-rc1, 2.4.0-rc2". They never say that
// something is missing; that is said once, on Readiness, where a build can be chosen (NO_SINGLE_BUILD).

/** Said once, beside the button that sets a build. */
export const NO_SINGLE_BUILD = 'No single build is set for this release; each pass names the build it was tested on.';

/** The builds named by these runs (null and runs without a build are skipped), each once, sorted. */
export const buildsOfRuns = (runs) => [...new Set(runs.flatMap((run) => (run?.build ? [String(run.build)] : [])))].sort();

/** From live readiness: the latest run of every case. */
export const buildsOfRequirements = (requirements) =>
  buildsOfRuns((requirements ?? []).flatMap((req) => req.cases.map((c) => c.latestRun)));

/** From a sealed payload: the run sealed with every case. The payload is only read. */
export const buildsOfPayload = (payload) => buildsOfRuns(payload.items.flatMap((item) => item.cases.map((c) => c.run)));

/**
 * The label and the list for a release with no build set; null when no run names a build (then nothing is said).
 * @param {string[]} builds
 * @returns {{label: 'Build tested'|'Builds tested', list: string}|null}
 */
export const buildsTested = (builds) =>
  builds.length === 0 ? null : { label: builds.length === 1 ? 'Build tested' : 'Builds tested', list: builds.join(', ') };

/**
 * One phrase for a line of facts: "Build 2.4.0-rc2" when a build is set, else "Builds tested: 2.4.0-rc1, 2.4.0-rc2",
 * else null.
 * @param {string|null|undefined} build   the build set on the release
 * @param {string[]} builds               the builds of the latest runs
 */
export const buildPhrase = (build, builds) => {
  if (build) return `Build ${build}`;
  const tested = buildsTested(builds);
  return tested ? `${tested.label}: ${tested.list}` : null;
};

/** The sentence a tool gives an agent to repeat; null when there is nothing to say about builds. */
export const buildSentence = (build, builds) => {
  if (build) return `The build being accepted is ${build}.`;
  const phrase = buildPhrase(null, builds);
  return phrase ? `${phrase}.` : null;
};
