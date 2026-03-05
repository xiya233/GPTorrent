export const MAX_TAG_COUNT = 12;
export const MAX_TAG_LENGTH = 4;

export function parseTagsInput(input: string) {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_TAG_COUNT);
}

export function getTagCharLength(tag: string) {
  return Array.from(tag).length;
}

export function validateTags(tags: string[]) {
  const exceeded = tags.find((tag) => getTagCharLength(tag) > MAX_TAG_LENGTH);
  if (exceeded) {
    return `单个标签最多 ${MAX_TAG_LENGTH} 个字符`;
  }
  return null;
}

export function getFirstTagExceedingLength(tags: string[]) {
  return tags.find((tag) => getTagCharLength(tag) > MAX_TAG_LENGTH) ?? null;
}
