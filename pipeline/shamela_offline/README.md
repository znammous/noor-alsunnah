# نسخة الشاملة المحلية

قاعدة بيانات المكتبة الشاملة الكاملة (الإصدار 1448) من صفحة التنزيل الرسمية:
https://dev.shamela.ws/downloads/shamela-database-1448.zip — تُفك في `data/raw/shamela/offline/` (خارج git).

- `database/master.db`: فهرس الكتب (الاسم، القسم، المؤلف، روابط PDF).
- `database/book/<آخر 3 أرقام>/<رقم الكتاب>.db`: لكل صفحة الجزء ورقم الصفحة المطبوعة ورقم أول حديث فيها.
- `database/store/page`: نصوص الصفحات (`body`) وحواشيها (`foot`) في فهرس Lucene 10.4.

استخراج كتب كاملة إلى `data/raw/shamela/offline/books/<رقم الكتاب>.jsonl` (يحتاج Java 21 ومكتبة lucene-core 10.4.0):

    T=data/raw/shamela/tools
    $T/jdk21/Contents/Home/bin/java -cp $T/lucene-core-10.4.0.jar pipeline/shamela_offline/Dump.java \
        data/raw/shamela/offline/database/store/page data/raw/shamela/offline/books 1729

رقم الصفحة في الملف هو نفسه في روابط shamela.ws/book/<الكتاب>/<الصفحة>. النص يطابق الموقع، مع فروق شكلية:
الأسطر مفصولة بـ `\r`، و«ﷺ» رمز واحد، وأرقام الحواشي مسبوقة بـ `¬` مثل `(¬١)`، وعناوين الأبواب داخل `<span data-type='title'>`.
