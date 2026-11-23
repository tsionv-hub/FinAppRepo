// English and Hebrew strings (ported from the prototype). Sheet data is English only.

export type Lang = 'en' | 'he';

const en = {
  title: 'Finance Planner', reload: 'Reload', loading: 'Reading your sheet…', read: 'Updated', free: 'Free money today',
  freeN: 'After tax, from liquid assets only (not unvested Intel shares or pension). Every goal stays funded on its due date.', lim: 'Limited by',
  none1: 'Nothing free right now. Saving about {x} more per month would fund every goal.', none2: 'Nothing free right now, and even ₪1M more per month would not cover every goal.',
  freeL: 'Free', scl: 'Return scenario', sco: 'Optimistic', scm: 'Moderate', scp: 'Pessimistic', scf: 'Returns × {f}', r5: '5y avg', sre: 'Stock reinvestment', avgr: 'average return {r}%', agel: 'Age {a}', legRet: 'Retirement period', month: 'Month (optional, default January)',
  pen: 'Pension', pt1: 'Total at pension age', pt2: 'Monthly pension, pre-tax', pt3: 'Monthly pension, after tax', pt4: 'Share of your retirement allowance covered', pas: 'Pension assumptions',
  pg: 'Deposit growth %/yr', ptx: 'Tax rate on pension %', po: 'Old-age allowance ₪/month',
  pnote: 'Today {n}. Deposits until retirement {d}; fees {f}. Deposits stop in Jan {y}; interest continues until age {p}. Pension = total ÷ conversion coefficient; {x}% exempt up to {c}/month. {m}',
  pfn: 'Per-fund details (balance, deposit, fees, interest, coefficient) are in the Pension tab of your sheet.', pnom: 'Shown in future shekels. Turn on inflation to see today’s money.',
  nxt: 'Next goals', ogl: 'Other goals', retS: 'Retirement starts', mo2: 'month', inT: 'in', ral: 'Retirement age', all: 'Monthly allowance until pension ₪', rs2: 'Save retirement settings',
  ri: 'Born {b}; pension starts at age {p}. The allowance is paid monthly from retirement until then. Yearly saving and the Intel grant stop at retirement.', age: 'age', erg: 'Early retirement',
  rsaved2: 'Retirement settings saved to the sheet.', cfs: 'covered by future saving', rdl: 'Rainy day fund ₪', rsv: 'Save to sheet', rsaved: 'Rainy day fund saved to the Goals tab.', rdf: 'Rainy day fund',
  resv: 'reserved, never spent', cov: 'Covered', allRes: 'Nothing free right now: all liquid money is set aside for the rainy day fund and your goals.', enOnly: 'Adding and saving are available in English only.',
  enName: 'Goal names must be in English (the sheet is English only).', now: 'Status today', stat: 'Status in {d}', legFree: 'Free money', hold: 'Holdings', sepn: 'not in totals',
  pre: 'Pre-tax today', post: 'Post-tax today', est: 'Estimated tax', penl: 'pension', proj: 'Projection', legPre: 'Pre-tax', legPost: 'Post-tax', legGoal: 'Goal date',
  goals: 'Goals', newGoal: 'New goal', name: 'Name', amount: 'Amount ₪', year: 'Year', spend: 'Pay out on due date', add: 'Add goal', save1: 'Save 1 new goal to sheet', saveN: 'Save {n} new goals to sheet',
  ns: '(not saved)', rm: 'Remove', on: 'On track', sh: 'Short', prj: 'Projected balance', nog: 'No goals yet.', assum: 'Assumptions',
  ms: 'Monthly saving ₪', fc: 'Yearly free cash ₪ (Jan)', gr: 'Yearly Intel grant $ (Jan)', ir: 'Inflation %', cg: 'Capital gains tax %', it: 'Income tax %',
  inflc: 'Show in today’s money (adjust for inflation)', uvc: 'Count unvested Intel shares in totals', whatif: 'Changes here only affect this view. To keep them, use a Save button or edit your sheet.',
  where: 'Your money today by type (pre-tax)', need: 'Enter a name, an amount and a year ({y} or later).', addedH: 'Added to this view only. Tap Save to write it to your sheet.',
  wr: 'Saving to your sheet…', saved: 'Saved to the Goals tab.', chk: 'Check the Goals tab before trying again.',
  // standalone app
  setupT: 'Connect your Google Sheet', setupN: 'Paste the link to your finance sheet (or its ID). It is kept on this phone only.', sheetL: 'Sheet link or ID', cont: 'Continue',
  badId: 'That does not look like a Google Sheets link.', signT: 'Sign in with Google', signN: 'The app reads and writes this sheet directly from your phone. Your data goes nowhere else.',
  tpl: 'Download an empty template (.xlsx)', tplN: 'No sheet yet? Download the template, upload it to Google Drive and open it with Google Sheets.',
  chg: 'Change sheet', out: 'Sign out', diag: 'Sign-in test',
  eAuth: 'Your Google sign-in has expired. Sign in again.', eForb: 'This Google account cannot open the sheet. Check that it is shared with you.',
  eNF: 'Sheet not found. Check the link.', eNet: 'Could not reach Google ({c}). Check your connection and tap Reload.', eTab: 'Your sheet has no {t} tab. Compare it with the template.',
  eSign: 'Google sign-in did not complete ({c}).', noCid: 'This build has no Google client ID. Set VITE_GOOGLE_CLIENT_ID and rebuild.',
  noBirth: 'Add birth_year and retirement_age to the Settings tab to see retirement and pension.',
  ty: {} as Record<string, string>,
};

export type Key = Exclude<keyof typeof en, 'ty'>;

const he: Record<Key, string> & { ty: Record<string, string> } = {
  title: 'תכנון פיננסי', reload: 'רענון', loading: 'קורא את הגיליון…', read: 'עודכן', free: 'כסף פנוי היום',
  freeN: 'אחרי מס, מנכסים נזילים בלבד (ללא מניות אינטל שלא הבשילו וללא פנסיה). כל יעד נשאר ממומן במועדו.', lim: 'מוגבל על ידי',
  none1: 'אין כרגע כסף פנוי. חיסכון של כ-{x} נוספים בחודש יממן את כל היעדים.', none2: 'אין כרגע כסף פנוי, וגם ₪1M נוספים בחודש לא יכסו את כל היעדים.',
  freeL: 'פנוי', scl: 'תרחיש תשואה', sco: 'אופטימי', scm: 'מתון', scp: 'פסימי', scf: 'תשואות × {f}', r5: 'ממוצע 5 שנים', sre: 'השקעה מחדש ממכירת מניות', avgr: 'תשואה ממוצעת {r}%', agel: 'גיל {a}', legRet: 'תקופת פרישה', month: 'חודש (לא חובה, ברירת מחדל ינואר)',
  pen: 'פנסיה', pt1: 'סך הצבירה בגיל הפנסיה', pt2: 'קצבה חודשית לפני מס', pt3: 'קצבה חודשית אחרי מס', pt4: 'שיעור הכיסוי של קצבת הפרישה', pas: 'הנחות פנסיה',
  pg: 'גידול בהפקדה %/שנה', ptx: 'שיעור מס על הקצבה %', po: 'קצבת זקנה ₪/חודש',
  pnote: 'היום {n}. הפקדות עד הפרישה {d}; עלויות {f}. ההפקדות נעצרות בינואר {y}; הריבית ממשיכה עד גיל {p}. קצבה = סך ÷ מקדם המרה; {x}% פטור עד {c} לחודש. {m}',
  pfn: 'פרטי כל קרן (צבירה, הפקדה, עלויות, ריבית, מקדם) נמצאים בלשונית Pension בגיליון.', pnom: 'מוצג בשקלים עתידיים. הפעל אינפלציה כדי לראות כסף של היום.',
  nxt: 'היעדים הקרובים', ogl: 'יעדים אחרים', retS: 'תחילת פרישה', mo2: 'חודש', inT: 'בעוד', ral: 'גיל פרישה', all: 'קצבה חודשית עד הפנסיה ₪', rs2: 'שמור הגדרות פרישה',
  ri: 'נולדת ב-{b}; הפנסיה מתחילה בגיל {p}. הקצבה משולמת מדי חודש מהפרישה ועד אז. החיסכון השנתי ומענק אינטל נעצרים בפרישה.', age: 'גיל', erg: 'פרישה מוקדמת',
  rsaved2: 'הגדרות הפרישה נשמרו בגיליון.', cfs: 'מכוסה מחיסכון עתידי', rdl: 'קרן ליום סגריר ₪', rsv: 'שמור בגיליון', rsaved: 'קרן ליום סגריר נשמרה בלשונית היעדים.', rdf: 'קרן ליום סגריר',
  resv: 'שמור, לא מוצא', cov: 'מכוסה', allRes: 'אין כרגע כסף פנוי: כל הכסף הנזיל שמור לקרן ליום סגריר וליעדים.', enOnly: 'הוספה ושמירה אפשריות באנגלית בלבד.',
  enName: 'שמות יעדים חייבים להיות באנגלית (הגיליון באנגלית בלבד).', now: 'מצב היום', stat: 'מצב ב{d}', legFree: 'כסף פנוי', hold: 'נכסים', sepn: 'לא בסיכומים',
  pre: 'לפני מס היום', post: 'אחרי מס היום', est: 'מס משוער', penl: 'פנסיה', proj: 'תחזית', legPre: 'לפני מס', legPost: 'אחרי מס', legGoal: 'מועד יעד',
  goals: 'יעדים', newGoal: 'יעד חדש', name: 'שם', amount: 'סכום ₪', year: 'שנה', spend: 'לשלם במועד היעד', add: 'הוסף יעד', save1: 'שמור יעד חדש אחד בגיליון', saveN: 'שמור {n} יעדים חדשים בגיליון',
  ns: '(לא נשמר)', rm: 'הסר', on: 'במסלול', sh: 'חסר', prj: 'יתרה צפויה', nog: 'אין יעדים עדיין.', assum: 'הנחות',
  ms: 'חיסכון חודשי ₪', fc: 'מזומן פנוי שנתי ₪ (ינואר)', gr: 'מענק אינטל שנתי $ (ינואר)', ir: 'אינפלציה %', cg: 'מס רווח הון %', it: 'מס הכנסה %',
  inflc: 'הצג בכסף של היום (התאמה לאינפלציה)', uvc: 'כלול מניות אינטל שלא הבשילו בסיכומים', whatif: 'שינויים כאן משפיעים רק על התצוגה. כדי לשמור, השתמש בכפתור שמירה או ערוך את הגיליון.',
  where: 'הכסף שלך היום לפי סוג (לפני מס)', need: 'הזן שם, סכום ושנה ({y} ואילך).', addedH: 'נוסף לתצוגה בלבד. לחץ שמור כדי לכתוב לגיליון.',
  wr: 'שומר בגיליון…', saved: 'נשמר בלשונית היעדים.', chk: 'בדוק את לשונית היעדים לפני ניסיון נוסף.',
  setupT: 'חיבור לגיליון Google', setupN: 'הדבק את הקישור לגיליון הכספים שלך (או את המזהה שלו). הוא נשמר בטלפון הזה בלבד.', sheetL: 'קישור או מזהה גיליון', cont: 'המשך',
  badId: 'זה לא נראה כמו קישור ל-Google Sheets.', signT: 'התחברות עם Google', signN: 'האפליקציה קוראת וכותבת לגיליון ישירות מהטלפון. הנתונים לא נשלחים לשום מקום אחר.',
  tpl: 'הורדת תבנית ריקה (.xlsx)', tplN: 'אין עדיין גיליון? הורד את התבנית, העלה אותה ל-Google Drive ופתח אותה ב-Google Sheets.',
  chg: 'החלפת גיליון', out: 'התנתקות', diag: 'בדיקת התחברות',
  eAuth: 'ההתחברות ל-Google פגה. התחבר שוב.', eForb: 'חשבון Google הזה לא יכול לפתוח את הגיליון. בדוק שהוא משותף איתך.',
  eNF: 'הגיליון לא נמצא. בדוק את הקישור.', eNet: 'לא ניתן להגיע ל-Google ({c}). בדוק את החיבור ולחץ רענון.', eTab: 'בגיליון אין לשונית {t}. השווה לתבנית.',
  eSign: 'ההתחברות ל-Google לא הושלמה ({c}).', noCid: 'בגרסה הזו אין מזהה לקוח של Google. הגדר VITE_GOOGLE_CLIENT_ID ובנה מחדש.',
  noBirth: 'הוסף birth_year ו-retirement_age ללשונית Settings כדי לראות פרישה ופנסיה.',
  ty: {
    Pension: 'פנסיה', 'Study fund': 'קרן השתלמות', 'Investment fund': 'קופת גמל להשקעה', 'Savings plan': 'קופת חיסכון', Brokerage: 'חשבון מסחר',
    Cash: 'מזומן', Stocks: 'מניות', 'Stocks (unvested)': 'מניות שלא הבשילו', 'Stock reinvestment': 'השקעה מחדש ממניות',
  },
};

const T = { en, he };

let lang: Lang = 'en';
export function getLang(): Lang {
  return lang;
}
export function setLang(l: Lang): void {
  lang = l;
}
export function locale(): string {
  return lang === 'he' ? 'he-IL' : 'en-GB';
}

export function t(k: Key, o?: Record<string, string | number>): string {
  let s: string = T[lang][k] ?? en[k] ?? k;
  if (o) for (const x in o) s = s.replace('{' + x + '}', String(o[x]));
  return s;
}

export function ty(type: string): string {
  return T[lang].ty[type] ?? type;
}

// Built-in dictionary for common goal words. Personal names are not included;
// they stay as written in the sheet.
const WORDS: Record<string, string> = {
  wedding: 'חתונה', car: 'רכב', apartment: 'דירה', vacation: 'חופשה', university: 'לימודים', army: 'צבא', trip: 'טיול',
  house: 'בית', renovation: 'שיפוץ', kitchen: 'מטבח', bar: 'בר', mitzvah: 'מצווה', bat: 'בת', school: 'בית ספר', laptop: 'מחשב נייד', gift: 'מתנה',
};

export function goalName(n: string): string {
  if (lang !== 'he') return n;
  const s = n.trim();
  const m = /^(.+?)['’]s wedding$/i.exec(s);
  if (m) return 'החתונה של ' + m[1];
  if (/^rainy day fund$/i.test(s)) return t('rdf');
  if (/^early retirement$/i.test(s)) return t('erg');
  return s.replace(/[A-Za-z]+/g, (x) => WORDS[x.toLowerCase()] ?? x);
}
