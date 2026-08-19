// Deterministic, transparent rules — no AI needed for arithmetic like this.
// Shared by the /rewards route and the "check my treat credits" / "redeem a
// treat" chat tools, so both agree on the same numbers.
const WINDOW_DAYS = 7;
const JUNK_DEBT_MINUTES = 20; // suggested extra light activity per junk food/drink instance
const CREDIT_MINUTES = 25; // minutes of logged extra activity that earns one treat credit
const MAX_BANKED_CREDITS = 3; // caps hoarding — this isn't a save-up-for-a-binge system
const TREAT_PORTION_NOTE =
  "a small treat (~150 kcal) — e.g. a small cookie, half a can of soda, a small scoop of ice cream";

function withinWindow(iso) {
  return Date.now() - new Date(iso).getTime() <= WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function computeRewardsSummary(store) {
  const junkCount = store.foodLog.filter((e) => e.isJunkFood && withinWindow(e.at)).length;
  const activityMinutes = store.activityLog
    .filter((e) => withinWindow(e.at))
    .reduce((sum, e) => sum + e.durationMinutes, 0);
  const redemptionsThisWindow = store.rewardRedemptions.filter((e) => withinWindow(e.at)).length;

  const debtMinutesRaw = junkCount * JUNK_DEBT_MINUTES;
  const netMinutes = activityMinutes - debtMinutesRaw;

  const earnedCredits = netMinutes > 0 ? Math.floor(netMinutes / CREDIT_MINUTES) : 0;
  const availableCredits = Math.max(0, Math.min(MAX_BANKED_CREDITS, earnedCredits - redemptionsThisWindow));
  const outstandingDebtMinutes = netMinutes < 0 ? Math.abs(netMinutes) : 0;

  return {
    windowDays: WINDOW_DAYS,
    junkCount,
    activityMinutes,
    outstandingDebtMinutes,
    availableCredits,
    redemptionsThisWindow,
    rules: {
      junkDebtMinutes: JUNK_DEBT_MINUTES,
      creditMinutes: CREDIT_MINUTES,
      maxBankedCredits: MAX_BANKED_CREDITS,
      treatPortionNote: TREAT_PORTION_NOTE,
    },
  };
}
