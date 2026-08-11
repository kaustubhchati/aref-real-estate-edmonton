// =============================================================================
// verifyOutput.mjs
//
// A FAIL-CLOSED guard on the built site. It stops the build if dist/ contains a
// file that no part of the build was entitled to create.
//
// WHAT IT PROTECTS AGAINST
//   Other programs write into these folders while we work, and whatever they
//   leave behind gets deployed along with the site. Two cases seen on this
//   machine, both real:
//     • macOS Finder leaves `.DS_Store` files inside website/public/, and Vite
//       copies everything in public/ verbatim into dist/.
//     • iCloud (which syncs ~/Desktop) writes conflict copies straight into
//       dist/ while a build is running — names like `index-CpAo5A_E 2.css`.
//   Neither is ours, and neither should reach the server.
//
// WHY FAIL-CLOSED RATHER THAN FAIL-OPEN
//   The tempting fix is a list of bad names: reject anything containing " 2",
//   reject `.DS_Store`. That only ever knows about the junk we have already been
//   bitten by. The next editor, sync tool, or backup agent invents a name nobody
//   listed, and walks straight through.
//   So this guard asks the opposite question. Not "does this file look wrong?"
//   but "can this file be ACCOUNTED FOR?" Every file in dist/ must be traceable
//   to something that had the right to put it there. Anything else stops the
//   build.
//   A consequence worth stating plainly: when we start publishing a genuinely
//   new kind of file, this guard will fail too, until a person permits it. That
//   is the intended behaviour, not a rough edge. A new file should be let in
//   deliberately, not because its extension happened to look familiar.
//
// WHAT COUNTS AS ACCOUNTED FOR
//   1. Vite emitted it. We capture the exact filenames from Rollup in-process,
//      so a look-alike sitting in assets/ is NOT covered by this — only the real
//      emitted names are.
//   2. It is a copy of a file in public/ that git TRACKS. Junk like .DS_Store is
//      gitignored, therefore untracked, therefore not accounted for.
//   3. It is a .gz or .br sibling of a file that is itself accounted for
//      (written by precompress.mjs).
// =============================================================================

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

// Every file under `dir`, as paths relative to it, using forward slashes so they
// compare cleanly against the names Rollup and git report.
export async function listFilesRelative(dir) {
  const found = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  }
  await walk(dir);
  return found;
}

// Ask git which files in public/ are tracked. Anything untracked there is, by
// definition, something nobody committed — which is exactly the signal we want.
//
// If git cannot answer, we STOP rather than assume. Guessing here would quietly
// turn the guard off, which is the one thing it must never do.
function gitTrackedFiles(publicDir) {
  try {
    const stdout = execFileSync("git", ["ls-files", "-z"], {
      cwd: publicDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return new Set(stdout.split("\0").filter(Boolean));
  } catch {
    throw new Error(
      [
        "",
        "Build stopped: could not ask git which files in website/public/ are tracked.",
        "",
        "This check needs to run inside a real git checkout. It refuses to continue",
        "without that answer, because assuming everything is fine is how unwanted",
        "files reach the live site in the first place.",
        "",
        "If you are building from a downloaded .zip rather than a git clone, clone",
        "the repository instead and build from that.",
        "",
      ].join("\n")
    );
  }
}

// The report the operator actually reads. It has to be usable by someone who has
// never opened this file, so: name the files, say what the rule is, say what to do.
function describeFailure(offenders, counts) {
  const list = offenders.map((f) => `    ${f.rel}   (${f.bytes} bytes)`).join("\n");
  return [
    "",
    `Build stopped: dist/ contains ${offenders.length} file(s) that this build did not create.`,
    "",
    list,
    "",
    "Every file in dist/ has to come from one of three places:",
    `    • Vite's own build output ....................... ${counts.emitted} files this build`,
    `    • a file in website/public/ that git tracks ..... ${counts.tracked} files`,
    "    • a .gz or .br copy of one of those",
    "",
    "The files listed above match none of them.",
    "",
    "The usual cause is another program writing into the folder. macOS Finder",
    'leaves ".DS_Store" files behind; iCloud and Dropbox leave duplicates with',
    'names like "index-abc 2.css" while a build is running.',
    "",
    "What to do:",
    "  1. Look at the list above. If it is junk left by another program, delete",
    "     those files and run the build again.",
    "  2. If one of them is something we now genuinely publish, put it in",
    "     website/public/ and commit it to git. It is then allowed automatically,",
    "     and no change to this check is needed.",
    "",
    "This check is deliberately strict: it refuses anything it cannot account",
    "for, rather than guessing. See website/scripts/verifyOutput.mjs.",
    "",
  ].join("\n");
}

/**
 * Throw if dist/ holds anything unaccounted for.
 *
 * @param {string}   distDir    absolute path to the built tree
 * @param {string}   publicDir  absolute path to website/public
 * @param {string[]} emitted    exact filenames Rollup emitted, relative to distDir
 */
export async function verifyOutputTree({ distDir, publicDir, emitted }) {
  const tracked = gitTrackedFiles(publicDir);
  const fromBundler = new Set(emitted);

  // A file is accounted for if the bundler emitted it, or git tracks it in
  // public/, or it is the compressed twin of something that is itself fine.
  function accountedFor(rel) {
    if (fromBundler.has(rel) || tracked.has(rel)) return true;
    if (rel.endsWith(".gz") || rel.endsWith(".br")) return accountedFor(rel.slice(0, -3));
    return false;
  }

  const present = await listFilesRelative(distDir);
  const offenders = present.filter((rel) => !accountedFor(rel)).sort();
  if (offenders.length === 0) return;

  const detailed = await Promise.all(
    offenders.map(async (rel) => ({
      rel,
      bytes: (await fs.stat(path.join(distDir, rel))).size,
    }))
  );
  throw new Error(
    describeFailure(detailed, { emitted: fromBundler.size, tracked: tracked.size })
  );
}

/**
 * Same check, wired for use inside a build: print the report and stop.
 *
 * Throwing would also stop the build, but Vite wraps a thrown plugin error in a
 * stack trace pointing into rolldown's internals — which buries the part the
 * operator is supposed to read under machinery they cannot act on. The report
 * IS the error here, so print it plainly and exit non-zero.
 */
export async function verifyOutputTreeOrExit(options) {
  try {
    await verifyOutputTree(options);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
