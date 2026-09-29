# הבר הביתי

אפליקציה שיודעת מה יש לך בבית, מציעה קוקטיילים לפי מצב רוח, עוזרת לקנות בקבוקים, ומשווה מחירי יין במסעדה.

מאותו קוד נבנות שתי גרסאות:

| גרסה | איפה | אחסון | Claude |
|---|---|---|---|
| **claude.ai** (Artifact) | הקישור הפרטי ב-claude.ai | הבר של כל משתמש נשמר בנפרד ב-claude.ai | דרך החשבון של המשתמש |
| **ווב** | אתר משלך ב-Vercel | Supabase: התחברות עם Google או מייל, בר פרטי לכל משתמש | דרך השרת שלך (`api/claude.js`), עם מכסה יומית לכל משתמש |

## מבנה

```
src/app.html          האפליקציה כולה: עיצוב, מאגר הבקבוקים והיינות, חיפוש, מתכונים
src/prompts.cjs       הפרומפטים ל-Claude ותבניות התשובה. משמשים את שתי הגרסאות
web/                  קבצים של גרסת הווב: חיבור ל-Supabase, מניפסט, service worker, אייקונים
api/claude.js         פונקציית שרת: מאמתת משתמש, בודקת מכסה, פונה ל-Claude
supabase/schema.sql   הטבלאות וההרשאות
scripts/build.mjs     בונה את dist/artifact.html ואת public/
```

## פיתוח

```bash
npm install
npm run build        # יוצר את dist/artifact.html (לפרסום ב-claude.ai) ואת public/ (לווב)
```

עורכים את `src/app.html` או את `src/prompts.cjs`, ומריצים build. את `dist/artifact.html` מפרסמים ל-claude.ai. גרסת הווב מתעדכנת לבד בכל push, אחרי שהיא מחוברת ל-Vercel.

להרצה מקומית של גרסת הווב, כולל השרת: `npx vercel dev`. צריך קובץ `.env.local` לפי `.env.example`.

## מעבר לגרסת הווב: צ׳קליסט

מה שמסומן **[את]** דורש פעולה בחשבון שלך. את כל השאר אני עושה.

1. **[את] GitHub:** יוצרים ריפו ריק (למשל `home-bar`) ומחברים אותו לסשן של Claude Code. אני דוחף אליו את הקוד.
2. **[את] Supabase** (supabase.com, יש שכבה חינמית):
   - New project. אזור: Frankfurt, הכי קרוב לישראל.
   - SQL Editor → מדביקים את `supabase/schema.sql` → Run.
   - Authentication → Providers: Email מופעל כברירת מחדל (קישור כניסה במייל). בשביל Google צריך OAuth Client מ-Google Cloud Console. ההוראות מופיעות בדף ה-Provider עצמו.
   - Authentication → URL Configuration: מגדירים את Site URL לכתובת שתקבלו מ-Vercel.
   - Project Settings → API: מעתיקים את `URL`, את `anon` ואת `service_role`. הערכים לא נשלחים בצ׳אט, הם נכנסים ישר ל-Vercel.
3. **[את] Anthropic** (console.anthropic.com): מוסיפים אמצעי תשלום, יוצרים API key ומגדירים תקרת הוצאה חודשית ב-Limits.
4. **[את] Vercel** (vercel.com, יש שכבה חינמית):
   - Add New → Project → בוחרים את הריפו.
   - Settings → Environment Variables: שמות המשתנים מ-`.env.example`, עם הערכים משלבים 2–3.
   - Deploy.
5. **העברת הבר שלך:** ב-claude.ai, בטאב "הבר שלי" ← "העברת הבר" ← "העתקת הבר". באתר החדש, אחרי ההתחברות, מדביקים ולוחצים "ייבוא".

## עלויות (הערכה)

- **Supabase ו-Vercel:** חינם בשכבה החינמית, למספר משתמשים של חברים ומשפחה.
- **Claude** (`claude-opus-5-5`, $4 למיליון טוקנים נכנסים ו-$20 למיליון יוצאים): צילום תפריט או חיפוש יין עולים בערך כמה סנטים לפעולה. המכסה `AI_DAILY_LIMIT` (ברירת מחדל 40 פעולות ליום למשתמש) ותקרת ההוצאה ב-Anthropic Console שומרות שזה לא יברח.

## הערות

- **מחירי החנויות במאגר הם הערכות.** הטבלה `prices` מוכנה לשלב הבא: עבודה שמעדכנת מחירים מחנויות, עם גודל בקבוק ותאריך לכל מחיר.
- **השרת פונה ל-Claude עם תבנית תשובה (JSON schema)**, כך שהתשובה תמיד ניתנת לפענוח. מופעל גם fallback של המודל למקרה שבקשה נדחית.
- **הלקוח שולח רק שם משימה ופרמטרים.** השרת בונה את הפרומפט בעצמו, כך שאי אפשר להשתמש בו כפרוקסי חופשי ל-Claude.
