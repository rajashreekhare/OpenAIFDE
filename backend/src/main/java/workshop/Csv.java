package workshop;

import java.io.BufferedReader;
import java.io.Closeable;
import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.util.ArrayList;
import java.util.List;

/** Small UTF-8 CSV feed reader. Supports quoted fields, escaped quotes and CRLF. */
final class Csv implements Closeable {
    private final String file;
    private final BufferedReader input;
    private int record;

    Csv(String file, Reader reader) {
        this.file = file;
        this.input = new BufferedReader(reader);
    }

    IOException invalid(String reason) {
        return new IOException(file + ", record " + record + ": " + reason);
    }

    List<String> next() throws IOException {
        int c = input.read();
        if (c == -1) {
            return null;
        }
        record++;
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        boolean closedQuote = false;
        while (true) {
            if (quoted) {
                if (c == -1) {
                    throw invalid("unterminated quoted field");
                }
                if (c == '"') {
                    c = input.read();
                    if (c != '"') {
                        quoted = false;
                        closedQuote = true;
                        continue;
                    }
                }
                field.append((char) c);
            } else if (c == ',' || c == '\n' || c == '\r' || c == -1) {
                fields.add(field.toString());
                if (c != ',') {
                    if (c == '\r') {
                        input.mark(1);
                        if (input.read() != '\n') {
                            input.reset();
                        }
                    }
                    return fields;
                }
                field.setLength(0);
                closedQuote = false;
            } else if (closedQuote) {
                throw invalid("unexpected character after closing quote");
            } else if (c == '"') {
                if (field.length() != 0) {
                    throw invalid("quote in unquoted field");
                }
                quoted = true;
            } else {
                field.append((char) c);
            }
            c = input.read();
        }
    }

    static void write(Writer writer, List<String> fields) throws IOException {
        for (int i = 0; i < fields.size(); i++) {
            if (i > 0) {
                writer.write(',');
            }
            String value = fields.get(i);
            if (value.indexOf(',') >= 0 || value.indexOf('"') >= 0 ||
                    value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
                writer.write('"');
                writer.write(value.replace("\"", "\"\""));
                writer.write('"');
            } else {
                writer.write(value);
            }
        }
        writer.write('\n');
    }

    @Override
    public void close() throws IOException {
        input.close();
    }
}
