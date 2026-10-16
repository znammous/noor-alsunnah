# نور السنة

أداة ويب مفتوحة لدراسة أسانيد الصحيحين: شجرة الرواة لكل حديث، وطرقه في البخاري ومسلم، والمدار، والمتابعات والشواهد، وانتشار الحديث في كتب السنة، وتراجم الرواة مع أقوال أئمة الجرح والتعديل، ولوحة مؤشرات.

## التشغيل

```bash
scripts/fetch_data.sh   # تنزيل البيانات الخام (~1.6 GB) إلى data/raw
scripts/build.sh        # بناء بيانات الموقع إلى site/data (يحتاج python3 + pandas + openpyxl)
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
| `pipeline/load_bukhari.py` | البخاري من hadithdb: الكتب والأبواب وترقيم فتح الباري |
| `pipeline/load_muslim.py` | مسلم من MIDS: الكتب والأبواب |
| `pipeline/kg_load.py` | الأسانيد والرواة والأحكام وتجميع المعاني من «الجامع»، ومطابقتها بالمصدرين السابقين بترتيب الكتاب |
| `pipeline/build_site.py` | إنتاج ملفات الموقع والمؤشرات (مجزأة لتقليل عدد الملفات) |
| `site/` | واجهة الموقع: `index.html` و`app.js` و`style.css`، ومكتبتا الرسم في `vendor/` |

## مصادر البيانات

- [«الجامع» — Hadith Knowledge Graph](https://huggingface.co/datasets/emadjumaah/hadith-kg) — CC BY 4.0: الأسانيد، الرواة ورتبهم، أقوال الجرح والتعديل، تجميع روايات المعنى الواحد عبر 425 كتابًا.
- [hatemben/hadithdb](https://github.com/hatemben/hadithdb): أبواب البخاري وترقيمه.
- [Multi-IsnadSet (MIDS)](https://data.mendeley.com/datasets/gzprcr93zn) — CC BY 4.0: أبواب مسلم.

## تفعيل مؤشر «الأكثر بحثًا وزيارة»

الموقع ثابت، فلا يعرف زيارات المستخدمين الآخرين إلا بعدّاد صغير. عرّف قبل تحميل `app.js`:

```html
<script>window.ANALYTICS_ENDPOINT = "https://<your-worker>/stats";</script>
```

يستقبل العدّاد `POST {type: "view"|"search", key}`، ويعيد عند `GET` الشكل `{views: [[key, n]], searches: [[q, n]]}`.

## التواصل

للاقتراحات أو الإبلاغ عن خطأ: [zuhair.nammous@gmail.com](mailto:zuhair.nammous@gmail.com)

## تنبيه منهجي

أحاديث الصحيحين صحيحة بحكم الشيخين. ما يظهر من حكم على الإسناد المفرد حكم آلي من المصدر بحسب رتب الرجال، والمدار وتجميع الروايات محسوبان آليًا؛ فالأداة مساعدة للباحث لا بديل عن النظر.
