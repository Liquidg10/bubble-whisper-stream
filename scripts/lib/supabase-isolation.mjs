import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;

export function assertIdentifier(value, label = "identifier") {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return value;
}

export function assertProjectRef(value, label = "project ref") {
  if (!PROJECT_REF_PATTERN.test(value)) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return value;
}

export function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function quoteIdentifier(value) {
  assertIdentifier(value);
  return `"${value}"`;
}

export function parseArgs(argv, schema) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    const definition = schema[name];
    if (!definition) throw new Error(`unknown option: --${name}`);
    if (definition.type === "boolean") {
      result[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`--${name} requires a value`);
    }
    result[name] = value;
    index += 1;
  }
  for (const [name, definition] of Object.entries(schema)) {
    if (result[name] === undefined && definition.default !== undefined) {
      result[name] = definition.default;
    }
    if (definition.required && result[name] === undefined) {
      throw new Error(`missing required option: --${name}`);
    }
  }
  return result;
}

export function readManifestLines(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  const lines = readFileSync(absolutePath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  if (lines.length === 0) throw new Error(`empty manifest: ${relativePath}`);
  if (new Set(lines).size !== lines.length) {
    throw new Error(`duplicate entry in manifest: ${relativePath}`);
  }
  return lines;
}

export function readTsvManifest(relativePath, expectedColumns) {
  return readManifestLines(relativePath).map((line, index) => {
    const columns = line.split("\t");
    if (columns.length !== expectedColumns) {
      throw new Error(
        `${relativePath}:${
          index + 1
        } expected ${expectedColumns} tab-separated columns`,
      );
    }
    return columns;
  });
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

export function assertAbsolutePath(path, label) {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute path`);
  return path;
}

function createPrivateParent(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
}

export function writePrivateFile(path, contents, { overwrite = false } = {}) {
  assertAbsolutePath(path, "output path");
  createPrivateParent(path);
  if (!overwrite && existsSync(path)) {
    throw new Error(`refusing to overwrite existing output: ${path}`);
  }
  const temporaryPath = `${path}.tmp-${process.pid}`;
  const descriptor = openSync(temporaryPath, "wx", 0o600);
  try {
    writeFileSync(descriptor, contents);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(temporaryPath, 0o600);
  if (overwrite && existsSync(path)) rmSync(path);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

export function writePrivateJson(path, value, options) {
  writePrivateFile(path, `${JSON.stringify(value, null, 2)}\n`, options);
}

export function assertPrivateFile(path, label) {
  const details = lstatSync(path);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file, not a symlink`);
  }
  const mode = details.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `${label} must not be group/world accessible (mode ${mode.toString(8)})`,
    );
  }
}

function safeProcessError(label, result, secretValues = []) {
  let message = String(result.stderr || result.stdout || `${label} failed`)
    .trim();
  for (const secret of secretValues.filter(Boolean)) {
    message = message.replaceAll(secret, "[redacted]");
  }
  throw new Error(
    `${label} failed${
      result.status === null ? "" : ` (${result.status})`
    }: ${message}`,
  );
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    input: options.input,
    encoding: options.binary ? null : "utf8",
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    safeProcessError(options.label ?? command, result, options.secretValues);
  }
  return result.stdout;
}

export function readLinkedProjectRef() {
  const path = resolve(repoRoot, "supabase/.temp/project-ref");
  if (!existsSync(path)) {
    throw new Error(
      "link a project with `supabase link` before running isolation tooling",
    );
  }
  return assertProjectRef(
    readFileSync(path, "utf8").trim(),
    "linked project ref",
  );
}

export function getLinkedDatabaseConfig(expectedRef) {
  const linkedRef = readLinkedProjectRef();
  if (linkedRef !== expectedRef) {
    throw new Error(
      `linked project ${linkedRef} does not match expected ${expectedRef}`,
    );
  }
  const dryRun = runCommand(
    "supabase",
    ["db", "dump", "--linked", "--schema", "public", "--dry-run"],
    { label: "Supabase temporary database login" },
  );
  const parsed = {};
  for (
    const key of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"]
  ) {
    const match = dryRun.match(new RegExp(`^export ${key}="([^"]+)"$`, "mu"));
    if (!match) {
      throw new Error(
        `could not parse ${key} from Supabase temporary login`,
      );
    }
    parsed[key] = match[1];
  }
  return parsed;
}

function psqlArgs(database, extras = []) {
  return [
    "--host",
    database.PGHOST,
    "--port",
    database.PGPORT,
    "--username",
    database.PGUSER,
    "--dbname",
    database.PGDATABASE,
    "--no-psqlrc",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--set",
    "ON_ERROR_STOP=1",
    ...extras,
  ];
}

export function runPsql(database, sql, { binary = false } = {}) {
  return runCommand("psql", psqlArgs(database), {
    env: { ...process.env, PGPASSWORD: database.PGPASSWORD },
    input: sql,
    binary,
    label: "read-only PostgreSQL query",
    secretValues: [database.PGPASSWORD],
  });
}

export function runPsqlJson(database, sql) {
  const output = String(runPsql(database, sql)).trim();
  const lines = output.split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error(
      `expected one JSON row from PostgreSQL, received ${lines.length}`,
    );
  }
  return JSON.parse(lines[0]);
}

export function runSupabaseJson(args, label) {
  const output = runCommand("supabase", [...args, "--output", "json"], {
    label,
  });
  return JSON.parse(String(output));
}
