import { money, type ScenarioTotals } from '../calc';
import { WarnMark } from './ui';

export const OVER_HOURS_MSG = 'Hours exceed 168 h/week (24 h × 7 days), so EDI / hour isn’t computed';
const NEGATIVE_MSG = 'Negative EDI: expenses outweigh net income';

/** EDI / hour, with a warning mark when negative or when hours are impossible. */
export function EdiPerHour({ t }: { t: ScenarioTotals }) {
  if (t.overHours) return <>—<WarnMark title={OVER_HOURS_MSG} /></>;
  if (t.ediPerHour == null) return <>—</>;
  return (
    <>
      {money(t.ediPerHour)}
      {t.ediPerHour < 0 && <WarnMark title={NEGATIVE_MSG} />}
    </>
  );
}

/** An EDI amount, with a warning mark when negative. */
export function EdiAmount({ value, whole }: { value: number; whole?: boolean }) {
  return (
    <>
      {money(value, whole)}
      {value < 0 && <WarnMark title={NEGATIVE_MSG} />}
    </>
  );
}
