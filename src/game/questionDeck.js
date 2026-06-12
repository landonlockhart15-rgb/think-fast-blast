import { createSeededRandom, hashString, shuffleWithRandom } from "./random.js";

const POOL_SOURCES = {
  1: [{ level: 1 }, { level: 2, limit: 12 }],
  2: [{ level: 2 }, { level: 1, limit: 16 }, { level: 4, limit: 10 }],
  3: [{ level: 3 }, { level: 8, limit: 18 }],
  4: [{ level: 4 }, { level: 2, limit: 18 }, { level: 6, limit: 14 }],
  5: [{ level: 5 }, { level: 8, limit: 18 }],
  6: [{ level: 6 }, { level: 4, limit: 20 }, { level: 7, limit: 16 }],
  7: [{ level: 7 }, { level: 6, limit: 20 }, { level: 10, limit: 16 }],
  8: [{ level: 8 }, { level: 3, limit: 18 }, { level: 5, limit: 18 }],
  9: [{ level: 9 }, { level: 18 }, { level: 14, limit: 10 }],
  10: [{ level: 10 }, { level: 6, limit: 20 }, { level: 7, limit: 20 }],
  11: [{ level: 11 }, { level: 6 }, { level: 7 }, { level: 10, limit: 20 }],
  12: [{ level: 12 }, { level: 4 }, { level: 6, limit: 20 }, { level: 7, limit: 16 }],
  13: [{ level: 13 }, { level: 4, limit: 24 }, { level: 6, limit: 18 }],
  14: [{ level: 14 }, { level: 9 }, { level: 2, limit: 18 }, { level: 10, limit: 16 }],
  15: [{ level: 15 }, { level: 3, limit: 24 }, { level: 8, limit: 24 }],
  16: [{ level: 16 }, { level: 7, limit: 24 }, { level: 10, limit: 20 }],
  17: [{ level: 17 }, { level: 1, limit: 20 }, { level: 2, limit: 20 }, { level: 4, limit: 20 }],
  18: [{ level: 18 }, { level: 9 }, { level: 14, limit: 12 }],
  19: [
    { level: 19 },
    { level: 11 },
    { level: 12 },
    { level: 13 },
    { level: 14 },
    { level: 15 },
    { level: 16 },
    { level: 17 },
    { level: 18 },
  ],
  20: [
    { level: 20 },
    { level: 19 },
    { level: 11 },
    { level: 12 },
    { level: 13 },
    { level: 14 },
    { level: 15 },
    { level: 16 },
    { level: 17 },
    { level: 18 },
  ],
};

const normalizeText = (value) => String(value || "").trim().replace(/\s+/g, " ");

export const getQuestionId = (question, sourceLevel = "custom") =>
  `q-${sourceLevel}-${hashString(normalizeText(question.q).toLowerCase()).toString(36)}`;

const normalizeQuestion = (question, sourceLevel) => ({
  ...question,
  q: normalizeText(question.q),
  options: question.options.map(normalizeText),
  sourceLevel,
  id: question.id || getQuestionId(question, sourceLevel),
});

export const shuffleQuestionOptions = (question, random = Math.random) => {
  const shuffled = shuffleWithRandom(
    question.options.map((value, index) => ({
      value,
      correct: index === question.answer,
    })),
    random
  );
  return {
    ...question,
    options: shuffled.map((option) => option.value),
    answer: shuffled.findIndex((option) => option.correct),
  };
};

const collectPool = (level, banks) => {
  const sources = POOL_SOURCES[level] || [{ level }];
  const byPrompt = new Map();

  sources.forEach(({ level: sourceLevel, limit }) => {
    const questions = banks[sourceLevel] || [];
    const selected = Number.isFinite(limit) ? questions.slice(0, limit) : questions;
    selected.forEach((question) => {
      const normalized = normalizeQuestion(question, sourceLevel);
      const promptKey = normalized.q.toLowerCase();
      if (!byPrompt.has(promptKey)) byPrompt.set(promptKey, normalized);
    });
  });

  return [...byPrompt.values()];
};

export const buildQuestionDeck = ({
  level,
  banks,
  recentIds = [],
  size = 60,
  seed = `${Date.now()}-${Math.random()}`,
}) => {
  const random = createSeededRandom(seed);
  const recent = new Set(recentIds);
  const pool = collectPool(level, banks);
  const unseen = shuffleWithRandom(pool.filter((question) => !recent.has(question.id)), random);
  const seen = shuffleWithRandom(pool.filter((question) => recent.has(question.id)), random);

  return [...unseen, ...seen]
    .slice(0, Math.min(size, pool.length))
    .map((question) => shuffleQuestionOptions(question, random));
};

export const getDailyChallengeKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const buildDailyQuestionDeck = ({
  banks,
  date = new Date(),
  size = 30,
}) => {
  const challengeKey = getDailyChallengeKey(date);
  const random = createSeededRandom(`think-fast-blast-${challengeKey}`);
  const groups = [
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9, 10],
    [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  ];
  const perGroup = Math.floor(size / groups.length);
  const selected = [];

  groups.forEach((levels, groupIndex) => {
    const pool = levels.flatMap((level) =>
      (banks[level] || []).map((question) => normalizeQuestion(question, level))
    );
    const groupSize = groupIndex === groups.length - 1
      ? size - selected.length
      : perGroup;
    selected.push(...shuffleWithRandom(pool, random).slice(0, groupSize));
  });

  return shuffleWithRandom(selected, random).map((question) =>
    shuffleQuestionOptions(question, random)
  );
};

export const validateQuestionBank = (banks) => {
  const issues = [];
  const prompts = new Map();

  Object.entries(banks).forEach(([level, questions]) => {
    questions.forEach((question, index) => {
      const location = `level ${level}, question ${index + 1}`;
      if (!normalizeText(question.q)) issues.push(`${location}: missing prompt`);
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        issues.push(`${location}: expected exactly four options`);
      }
      if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer > 3) {
        issues.push(`${location}: invalid answer index`);
      }
      const promptKey = normalizeText(question.q).toLowerCase();
      if (prompts.has(promptKey)) {
        issues.push(`${location}: duplicate of ${prompts.get(promptKey)}`);
      } else {
        prompts.set(promptKey, location);
      }
    });
  });

  return issues;
};
