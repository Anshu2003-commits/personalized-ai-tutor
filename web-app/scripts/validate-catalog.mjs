import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const tracks = ["dsa", "ds"];
const difficulties = new Set(["easy", "medium", "hard"]);
const idPattern = /^(dsa|ds)-m\d{2}-s\d{2}-q\d{3}$/;

let failed = false;
const globalIds = new Set();

function fail(message) {
  failed = true;
  console.error(`[catalog] ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateTestCases(track, question, label) {
  if (question.has_code === false) return;
  if (!Array.isArray(question.test_cases) || question.test_cases.length === 0) {
    fail(`${label} has no test_cases`);
    return;
  }

  question.test_cases.forEach((testCase, index) => {
    const testLabel = `${label} test_cases[${index}]`;
    if (!hasText(testCase.input) && !hasText(testCase.test)) {
      fail(`${testLabel} is missing input/test`);
    }
    if (!hasText(testCase.expected_output)) {
      fail(`${testLabel} is missing expected_output`);
    }
    if (typeof testCase.is_sample !== "boolean") {
      fail(`${testLabel} is missing boolean is_sample`);
    }
  });
}

for (const track of tracks) {
  const file = resolve(root, `data/courses/${track}/questions.json`);
  const questions = readJson(file);
  if (!Array.isArray(questions)) {
    fail(`${track} catalog is not an array`);
    continue;
  }

  const topicKeys = new Set();

  questions.forEach((question, index) => {
    const label = `${track}[${index}]`;
    const id = question.question_id;

    if (!hasText(id)) fail(`${label} is missing question_id`);
    if (hasText(id) && !idPattern.test(id)) {
      fail(`${label} uses non-owner id "${id}"`);
    }
    if (globalIds.has(id)) fail(`${label} duplicates question_id "${id}"`);
    globalIds.add(id);

    for (const field of [
      "step_title",
      "sub_step_title",
      "question_title",
      "question",
    ]) {
      if (!hasText(question[field])) fail(`${label} is missing ${field}`);
    }

    for (const field of ["step_no", "sub_step_no", "sl_no"]) {
      if (!Number.isInteger(question[field])) fail(`${label} has invalid ${field}`);
    }

    if (!difficulties.has(question.difficulty)) {
      fail(`${label} has invalid difficulty "${question.difficulty}"`);
    }

    topicKeys.add(`${question.step_no}:${question.sub_step_no}`);
    validateTestCases(track, question, label);
  });

  if (questions.length > 0 && topicKeys.size === 0) {
    fail(`${track} catalog has no topic grouping`);
  }

  console.log(
    `[catalog] ${track}: ${questions.length} questions, ${topicKeys.size} topics`,
  );
}

if (failed) {
  process.exit(1);
}

console.log("[catalog] validation passed");
