import { createHash, randomInt, randomUUID } from "node:crypto";
import {
  consumeCaptchaChallenge,
  createCaptchaChallenge,
  deleteExpiredCaptchaChallenges,
  type CaptchaPurpose,
} from "@/lib/db";

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function normalizeCaptchaAnswer(answer: string) {
  return answer.trim().toUpperCase().replace(/\s+/g, "");
}

function hashCaptchaAnswer(answer: string) {
  return createHash("sha256").update(normalizeCaptchaAnswer(answer)).digest("hex");
}

function randomCaptchaText() {
  const len = randomInt(4, 6);
  let value = "";
  for (let i = 0; i < len; i += 1) {
    value += CAPTCHA_CHARSET[randomInt(0, CAPTCHA_CHARSET.length)];
  }
  return value;
}

function renderCaptchaSvg(text: string) {
  const width = 140;
  const height = 48;
  const chars = text.split("");
  const charGap = width / (chars.length + 1);

  const letters = chars
    .map((char, idx) => {
      const x = Math.round(charGap * (idx + 1));
      const y = randomInt(28, 40);
      const rotate = randomInt(-24, 25);
      const fill = `hsl(${randomInt(0, 360)} 62% 32%)`;
      return `<text x="${x}" y="${y}" fill="${fill}" font-size="27" font-family="monospace" font-weight="700" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
    })
    .join("");

  const noiseLines = Array.from({ length: 5 })
    .map(() => {
      const x1 = randomInt(0, width);
      const x2 = randomInt(0, width);
      const y1 = randomInt(0, height);
      const y2 = randomInt(0, height);
      const alpha = (randomInt(28, 64) / 100).toFixed(2);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(20,20,20,${alpha})" stroke-width="1"/>`;
    })
    .join("");

  const dots = Array.from({ length: 18 })
    .map(() => {
      const cx = randomInt(0, width);
      const cy = randomInt(0, height);
      const r = randomInt(1, 3);
      const alpha = (randomInt(22, 58) / 100).toFixed(2);
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(60,60,60,${alpha})"/>`;
    })
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="8" ry="8" fill="#f3f4f6" />
  ${noiseLines}
  ${dots}
  ${letters}
</svg>
`.trim();
}

export async function createCaptchaChallengePayload(purpose: CaptchaPurpose, clientIp: string) {
  const answer = randomCaptchaText();
  const captchaId = randomUUID();
  const expiresAt = new Date(Date.now() + CAPTCHA_TTL_MS).toISOString();
  const nowIso = new Date().toISOString();

  deleteExpiredCaptchaChallenges(nowIso);
  createCaptchaChallenge({
    id: captchaId,
    purpose,
    answerHash: hashCaptchaAnswer(answer),
    expiresAt,
    clientIp,
  });

  return {
    captchaId,
    imageSvg: renderCaptchaSvg(answer),
    expiresAt,
  };
}

export function verifyAndConsumeCaptcha(input: {
  captchaId: string;
  answer: string;
  purpose: CaptchaPurpose;
}) {
  const nowIso = new Date().toISOString();
  deleteExpiredCaptchaChallenges(nowIso);

  const answerHash = hashCaptchaAnswer(input.answer);
  return consumeCaptchaChallenge({
    id: input.captchaId,
    purpose: input.purpose,
    answerHash,
    nowIso,
  });
}
