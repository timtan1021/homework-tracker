/** 日本の学校年度を返す。年度は4月に始まり翌年3月に終わる。 */
export function currentSchoolYear(now: Date = new Date()): number {
  const month = now.getMonth() + 1;
  return month <= 3 ? now.getFullYear() - 1 : now.getFullYear();
}
