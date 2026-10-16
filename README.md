# نور السنة

أداة ويب مفتوحة لدراسة أسانيد الصحيحين: شجرة الرواة لكل حديث، وطرقه في البخاري ومسلم، والمدار، والمتابعات والشواهد، وتخريج الحديث في كتب السنة، وتراجم الرواة ورتبهم عند ابن حجر والذهبي، ولوحة مؤشرات.

## التشغيل

```bash
KAGGLE_API_TOKEN=... scripts/fetch_data.sh   # تنزيل البيانات الخام إلى data/raw/ifta (يحتاج مفتاح Kaggle)
scripts/build.sh        # بناء بيانات الموقع إلى site/data (يحتاج python3)
scripts/serve.sh        # تشغيل الموقع على http://localhost:8765
```

الموقع ثابت بالكامل (HTML/CSS/JS بلا خادم). يُنشر على GitHub Pages من فرع `gh-pages` الذي يحوي مجلد `site/`:

```bash
scripts/publish.sh      # يدفع main ثم ينشر site/ إلى فرع gh-pages
```

الموقع المنشور: https://znammous.github.io/noor-alsunnah/

## البنية

| المسار | الوظيفة |
|---|---|
| `pipeline/ifta_load.py` | الأحاديث والأسانيد والرواة والتخريج من برنامج جامع خادم الحرمين الشريفين |
| `pipeline/build_site.py` | إنتاج ملفات الموقع والمؤشرات (مجزأة لتقليل عدد الملفات) |
| `pipeline/toc/` | فهرس الكتب الكبرى للصحيحين (اسم الكتاب وأول حديث فيه) |
| `pipeline/make_toc.py` + `load_bukhari.py` + `load_muslim.py` | أداة استُعملت مرة واحدة لجمع فهرس الكتب، ولا تدخل في البناء |
| `site/index.html` + `landing.css` | الصفحة التعريفية |
| `site/app.html` + `app.js` + `style.css` | الأداة نفسها، ومكتبتا الرسم في `vendor/` |

## مصادر البيانات

- **المصدر الأساسي:** [برنامج جامع خادم الحرمين الشريفين للسنة النبوية](https://sunna.alifta.gov.sa/) (الرئاسة العامة للبحوث العلمية والإفتاء): نصوص الأحاديث وأسانيدها، وتراجم الرواة ورتبهم عند ابن حجر والذهبي، والتخريج والشواهد. عن النسخة المهيكلة التي نشرها الباحث جهاد عمر ([Ifta Sunnah Hadith & Narrators Dataset](https://github.com/JehadOumer/Ifta-Sunnah-Hadith-and-Narrators-Dataset)). الحقوق العلمية للبرنامج محفوظة للرئاسة، والمشروع مستقل ولا يمثلها.
- **أحكام المحدثين:** روابط من صفحة كل حديث إلى [الموسوعة الحديثية في الدرر السنية](https://dorar.net/hadith). واجهتهم البرمجية لا تسمح بالعرض داخل مواقع أخرى (تُرسل بنوع text/html مع nosniff ودون CORS)، فتُفتح النتائج في موقعهم.
- **فهرس الكتب الكبرى** (`pipeline/toc/`) جُمع مرة واحدة بمطابقة أبواب البرنامج مع فهارس [hatemben/hadithdb](https://github.com/hatemben/hadithdb) و[MIDS](https://data.mendeley.com/datasets/gzprcr93zn).

## تفعيل مؤشر «الأكثر بحثًا وزيارة»

الموقع ثابت، فلا يعرف زيارات المستخدمين الآخرين إلا بعدّاد صغير. عرّف قبل تحميل `app.js`:

```html
<script>window.ANALYTICS_ENDPOINT = "https://<your-worker>/stats";</script>
```

يستقبل العدّاد `POST {type: "view"|"search", key}`، ويعيد عند `GET` الشكل `{views: [[key, n]], searches: [[q, n]]}`.

## التواصل

للاقتراحات أو الإبلاغ عن خطأ: [zuhair.nammous@gmail.com](mailto:zuhair.nammous@gmail.com)

## تنبيه منهجي

أحاديث الصحيحين صحيحة بحكم الشيخين. وصف رجال الإسناد المفرد مبني آليًا على رتبهم عند ابن حجر، والمدار محسوب آليًا؛ فالأداة مساعدة للباحث لا بديل عن النظر.
