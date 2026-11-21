import org.apache.lucene.index.*;
import org.apache.lucene.store.FSDirectory;
import org.apache.lucene.document.Document;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.*;
import org.apache.lucene.util.Bits;
import org.apache.lucene.search.DocIdSetIterator;

/**
 * Dumps whole books from the offline Shamela page index (Lucene 10.4, database/store/page)
 * as JSON lines {"book", "page", "body", "foot"}, sorted by page id. The page id matches
 * shamela.ws/book/<book>/<page> and the `page` table of database/book/NNN/<book>.db.
 *
 *   java -cp lucene-core-10.4.0.jar Dump.java <index dir> <out dir> <book id>...
 */
public class Dump {
    public static void main(String[] a) throws Exception {
        Set<Long> want = new HashSet<>();
        for (int i = 2; i < a.length; i++) want.add(Long.parseLong(a[i]));
        Map<Long, TreeMap<Long, String[]>> pages = new HashMap<>();
        try (DirectoryReader r = DirectoryReader.open(FSDirectory.open(Paths.get(a[0])))) {
            for (LeafReaderContext ctx : r.leaves()) {
                LeafReader leaf = ctx.reader();
                NumericDocValues book = leaf.getNumericDocValues("book");
                if (book == null) continue;
                StoredFields sf = leaf.storedFields();
                Bits live = leaf.getLiveDocs();
                for (int d = book.nextDoc(); d != DocIdSetIterator.NO_MORE_DOCS; d = book.nextDoc()) {
                    long b = book.longValue();
                    if (!want.contains(b) || (live != null && !live.get(d))) continue;
                    Document doc = sf.document(d);
                    String id = doc.get("id");
                    long p = Long.parseLong(id.substring(id.indexOf('-') + 1));
                    pages.computeIfAbsent(b, k -> new TreeMap<>()).put(p, new String[]{doc.get("body"), doc.get("foot")});
                }
            }
        }
        for (long b : want) {
            TreeMap<Long, String[]> m = pages.getOrDefault(b, new TreeMap<>());
            try (Writer w = new OutputStreamWriter(new FileOutputStream(Paths.get(a[1], b + ".jsonl").toFile()), StandardCharsets.UTF_8)) {
                for (Map.Entry<Long, String[]> e : m.entrySet())
                    w.write("{\"book\":" + b + ",\"page\":" + e.getKey() + ",\"body\":" + json(e.getValue()[0]) + ",\"foot\":" + json(e.getValue()[1]) + "}\n");
            }
            System.out.println(b + ": " + m.size() + " pages");
        }
    }

    static String json(String s) {
        if (s == null) return "null";
        StringBuilder o = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> o.append("\\\"");
                case '\\' -> o.append("\\\\");
                case '\n' -> o.append("\\n");
                case '\r' -> o.append("\\r");
                case '\t' -> o.append("\\t");
                default -> { if (c < 0x20) o.append(String.format("\\u%04x", (int) c)); else o.append(c); }
            }
        }
        return o.append('"').toString();
    }
}
