import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The backup procedure in reconcile-duplicates.ts, run exactly as written.
 *
 * It is documentation, which is precisely why it needs a test: its guard used
 * to `echo "STOP"` and carry on into pg_dump. The block is lifted out of the
 * header verbatim and run under bash against a fixture .env, with pg_dump and
 * pg_restore replaced by stubs that record whether they were reached. No
 * database is involved.
 */
const header = readFileSync(new URL("./reconcile-duplicates.ts", import.meta.url), "utf8");

function backupBlock(): string {
    const lines = header.split("\n").map((l) => l.replace(/^ \* {0,3}/, ""));
    const start = lines.findIndex((l) => l === "(");
    const end = lines.findIndex((l, i) => i > start && l === ")");
    if (start < 0 || end < 0) throw new Error("backup block not found in the header");
    return lines.slice(start, end + 1).join("\n");
}

function run(env: string | null, { restoreFails = false } = {}) {
    const root = mkdtempSync(join(tmpdir(), "jolt-backup-"));
    const home = join(root, "home");
    const bin = join(root, "bin");
    const log = join(root, "calls.log");
    mkdirSync(join(root, "server"));
    mkdirSync(home);
    mkdirSync(bin);
    if (env !== null) writeFileSync(join(root, "server", ".env"), env);

    // pg_dump: record the call and write the --file it was given.
    writeFileSync(
        join(bin, "pg_dump"),
        `#!/bin/bash\necho "pg_dump $*" >> "${log}"\nfor a in "$@"; do case "$a" in --file=*) echo dump > "\${a#--file=}";; esac; done\n`
    );
    writeFileSync(
        join(bin, "pg_restore"),
        `#!/bin/bash\necho "pg_restore $*" >> "${log}"\nexit ${restoreFails ? 1 : 0}\n`
    );
    chmodSync(join(bin, "pg_dump"), 0o755);
    chmodSync(join(bin, "pg_restore"), 0o755);

    const result = spawnSync("bash", ["-c", backupBlock() + '\necho "after the block: $?"'], {
        cwd: root,
        env: { HOME: home, PATH: `${bin}:/usr/bin:/bin` },
        encoding: "utf8"
    });
    const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
    return { ...result, calls, home };
}

const URL_LINE = "DATABASE_URL=postgresql://dev@localhost:5432/code_blitz_dev\n";

describe("the documented backup procedure", () => {
    it("is still where the test expects it", () => {
        expect(backupBlock()).toMatch(/^\(\n\s+set -eu/);
    });

    for (const [label, env] of [
        ["no .env at all", null],
        ["no DATABASE_URL line", "SESSION_SECRET=x\n"],
        ["DATABASE_URL defined twice", URL_LINE + URL_LINE],
        ["an empty DATABASE_URL", "DATABASE_URL=\n"]
    ] as const) {
        it(`stops with a nonzero status on ${label}, before pg_dump`, () => {
            const r = run(env);
            expect(r.stderr).toMatch(/STOP: DATABASE_URL/);
            expect(r.stdout).toMatch(/after the block: [1-9]/);
            expect(r.calls).not.toMatch(/pg_dump/);
            expect(r.stdout).not.toMatch(/readable:/);
        });
    }

    it("stops when the dump cannot be listed, without claiming it is readable", () => {
        const r = run(URL_LINE, { restoreFails: true });
        expect(r.stdout).toMatch(/after the block: [1-9]/);
        expect(r.stdout).not.toMatch(/readable:/);
    });

    it("dumps into a private folder outside the repository when every check passes", () => {
        const r = run(URL_LINE);
        expect(r.stdout).toMatch(/after the block: 0/);
        expect(r.calls).toMatch(/pg_dump --format=custom --file=.*\/home\/jolt-backups\/pre-reconcile-\d{8}-\d{6}\.dump postgresql:\/\/dev@localhost:5432\/code_blitz_dev/);
        expect(r.calls).toMatch(/pg_restore --list /);
        expect(r.stdout).toMatch(/readable: .*\/home\/jolt-backups\//);
        expect(statSync(join(r.home, "jolt-backups")).mode & 0o777).toBe(0o700);
    });
});
