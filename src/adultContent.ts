const adultKeywords = /\b(?:adults?|xxx|porn(?:ography)?|erotic(?:a)?|erotiek)\b/i;
const ageRestriction = /(?:^|[^0-9])18\s*(?:\+|plus\b)(?=$|[^0-9])/i;

export function isAdultContent(...values: (string | undefined)[]): boolean {
  return values.some((value) => {
    if (!value) return false;
    const normalized = value.normalize("NFKC").replace(/_/g, " ");
    return adultKeywords.test(normalized) || ageRestriction.test(normalized);
  });
}
