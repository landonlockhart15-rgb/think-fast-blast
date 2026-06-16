import test from "node:test";
import assert from "node:assert/strict";

import { QUESTION_BANKS } from "../data/questions.js";
import {
  buildDailyQuestionDeck,
  buildQuestionDeck,
  getDailyChallengeKey,
  shuffleQuestionOptions,
  validateQuestionBank,
} from "./questionDeck.js";

const BANKS = {
  1: [
    { q: "One?", options: ["A", "B", "C", "D"], answer: 0 },
    { q: "Two?", options: ["A", "B", "C", "D"], answer: 1 },
  ],
  2: [
    { q: "Three?", options: ["A", "B", "C", "D"], answer: 2 },
    { q: "Four?", options: ["A", "B", "C", "D"], answer: 3 },
  ],
};

test("buildQuestionDeck keeps unseen questions ahead of recent questions", () => {
  const first = buildQuestionDeck({ level: 1, banks: BANKS, size: 4, seed: "same" });
  const recentIds = first.slice(0, 2).map((question) => question.id);
  const next = buildQuestionDeck({ level: 1, banks: BANKS, recentIds, size: 4, seed: "same" });

  assert.equal(recentIds.includes(next[0].id), false);
  assert.equal(recentIds.includes(next[1].id), false);
});

test("buildQuestionDeck collects from multiple levels if isChaosDeck is true", () => {
  const deck = buildQuestionDeck({
    level: 1,
    banks: BANKS,
    size: 4,
    seed: "chaos",
    isChaosDeck: true,
  });

  const hasL1 = deck.some((q) => q.q === "One?" || q.q === "Two?");
  const hasL2 = deck.some((q) => q.q === "Three?" || q.q === "Four?");
  assert.equal(hasL1, true);
  assert.equal(hasL2, true);
});

test("buildQuestionDeck shuffles options while preserving the correct answer", () => {
  const deck = buildQuestionDeck({ level: 1, banks: BANKS, size: 4, seed: "options" });
  deck.forEach((question) => {
    const original = Object.values(BANKS).flat().find((item) => item.q === question.q);
    assert.equal(question.options[question.answer], original.options[original.answer]);
  });
});

test("option shuffling preserves the answer when option text is duplicated", () => {
  const question = shuffleQuestionOptions(
    { q: "Duplicate options?", options: ["Same", "Same", "Other", "Last"], answer: 1 },
    () => 0.99
  );

  assert.equal(question.options[question.answer], "Same");
  assert.equal(question.answer, 1);
});

test("daily challenge decks are stable for the same date", () => {
  const banks = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [
      index + 1,
      Array.from({ length: 3 }, (__, questionIndex) => ({
        q: `L${index + 1} Q${questionIndex + 1}`,
        options: ["A", "B", "C", "D"],
        answer: questionIndex % 4,
      })),
    ])
  );
  const date = new Date(2026, 5, 12);

  assert.deepEqual(
    buildDailyQuestionDeck({ banks, date, size: 18 }),
    buildDailyQuestionDeck({ banks, date, size: 18 })
  );
  assert.equal(getDailyChallengeKey(date), "2026-06-12");
});

test("validateQuestionBank reports duplicate prompts and malformed questions", () => {
  const issues = validateQuestionBank({
    1: [
      { q: "Duplicate?", options: ["A", "B", "C", "D"], answer: 0 },
      { q: "Duplicate?", options: ["A"], answer: 8 },
    ],
  });

  assert.equal(issues.length, 3);
});

test("every campaign bank has enough valid native variety", () => {
  Object.entries(QUESTION_BANKS).forEach(([level, questions]) => {
    assert.deepEqual(validateQuestionBank({ [level]: questions }), []);
    assert.ok(questions.length >= 20, `level ${level} needs at least 20 questions`);
  });
});
