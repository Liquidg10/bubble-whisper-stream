import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { scanFile } = require('../lint-assistant-cohesion.cjs');

function scan(t, content, filename = 'Surface.tsx') {
  const parent = resolve(tmpdir());
  const temporary = mkdtempSync(join(parent, 'assistant-cohesion-fixture-'));
  t.after(() => {
    assert.equal(dirname(temporary), parent);
    assert.ok(basename(temporary).startsWith('assistant-cohesion-fixture-'));
    rmSync(temporary, { recursive: true, force: false });
  });
  const directory = join(temporary, 'src', 'components');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, filename);
  writeFileSync(file, content);
  return scanFile(file).map(({ line, column, message, severity }) => ({ line, column,
    persona: message.match(/Persona name "([^"]+)"/)[1], severity }));
}

function finding(content, token, persona, occurrence = 0) {
  let offset = -1;
  for (let index = 0; index <= occurrence; index += 1) offset = content.indexOf(token, offset + 1);
  assert.ok(offset >= 0, 'Expected source token must exist');
  const preceding = content.slice(0, offset).split('\n');
  return { line: preceding.length, column: preceding.at(-1).length + 1, persona, severity: 'error' };
}

const moduleOnlyCases = [
  ['default import', 'import Glimmer from "./GlimmerNotificationSystem";'],
  ['side-effect import', 'import "./Glimmer";'],
  ['multiline named import', 'import {\n  Glimmer,\n  type Coach\n} from "./Glimmer";'],
  ['multiline type import', 'import type {\n  Persona\n}\nfrom "./Persona";'],
  ['multiline named re-export', 'export {\n  default as Glimmer\n}\nfrom "./Glimmer";'],
  ['star re-export', 'export * from "./Coach";'],
  ['namespace re-export', 'export * as Glimmer from "./Glimmer";'],
  ['multiline type re-export', 'export type {\n  Scientist\n} from "./Scientist";'],
];

for (const [name, content] of moduleOnlyCases) {
  test(`ignores only the static module specifier of a ${name}`, t => {
    assert.deepEqual(scan(t, content), []);
  });
}

test('preserves same-line user-facing string after import, with its original column', t => {
  const content = 'import Notice from "./Glimmer"; const label = "Coach";';
  assert.deepEqual(scan(t, content), [finding(content, '"Coach"', 'Coach')]);
});

test('preserves same-line JSX attribute and text after import', t => {
  const content = 'import Notice from "./Glimmer"; const View = () => <button aria-label="Coach">Glimmer</button>;';
  const actual = scan(t, content).sort((left, right) => left.column - right.column);
  assert.deepEqual(actual, [finding(content, '"Coach"', 'Coach'), finding(content, '>Glimmer<', 'Glimmer')]);
});

test('preserves same-line strings and JSX after re-export', t => {
  const content = 'export { default } from "./Glimmer"; const label = "CBT"; const View = () => <span data-kind="notice">Persona</span>;';
  assert.deepEqual(scan(t, content), [finding(content, '"CBT"', 'CBT'), finding(content, '>Persona<', 'Persona')]);
});

test('does not ignore the complete import line or labels before a declaration', t => {
  const content = 'const label = "Glimmer"; import Notice from "./Glimmer";';
  assert.deepEqual(scan(t, content), [finding(content, '"Glimmer"', 'Glimmer')]);
});

test('a module path containing an internal logging word cannot hide a same-line label', t => {
  const content = 'import Notice from "./Glimmer/trace"; const label = "Coach";';
  assert.deepEqual(scan(t, content), [finding(content, '"Coach"', 'Coach')]);
});

test('does not mask declaration attributes outside the module specifier', t => {
  const content = 'import Notice from "./Glimmer" with { type: "Coach" };';
  assert.deepEqual(scan(t, content), [finding(content, '"Coach"', 'Coach')]);
});

test('retains line and UTF-16 columns across multiline paths and CRLF', t => {
  const content = 'import Notice from "./Glimmer\\\r\nmodule";\r\nconst icon = "🫧"; const label = "Coach";';
  assert.deepEqual(scan(t, content), [finding(content, '"Coach"', 'Coach')]);
});

test('does not exempt dynamic imports, import types, or require calls', t => {
  const content = 'const lazy = import("./Glimmer");\nconst legacy = require("./Coach");\ntype Item = import("./Scientist").Item;';
  assert.deepEqual(scan(t, content), [finding(content, '"./Glimmer"', 'Glimmer'),
    finding(content, '"./Coach"', 'Coach'), finding(content, '"./Scientist"', 'Scientist')]);
});

test('does not mistake import-shaped user strings for declarations', t => {
  const content = 'const label = "import Glimmer from somewhere";\nconst View = () => <span data-kind="notice">export Glimmer from somewhere</span>;';
  assert.deepEqual(scan(t, content), [finding(content, '"import Glimmer', 'Glimmer'),
    finding(content, '>export Glimmer', 'Glimmer')]);
});

test('malformed source keeps module strings visible to the existing scanner', t => {
  const content = 'import Notice from "./Glimmer";\nconst broken = ;\nconst label = "Coach";';
  assert.deepEqual(scan(t, content), [finding(content, '"./Glimmer"', 'Glimmer'),
    finding(content, '"Coach"', 'Coach')]);
});

test('existing comment, logging and allowed-file rules remain unchanged', t => {
  const content = '// "Coach"\nconsole.log("Glimmer");\nlogger.info("Persona");';
  assert.deepEqual(scan(t, content), []);
  assert.deepEqual(scan(t, 'const label = "Coach";', 'Surface.test.tsx'), []);
});
