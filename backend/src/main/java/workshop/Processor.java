package workshop;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.SortedMap;
import java.util.TreeMap;

import javax.xml.bind.DatatypeConverter;

/** Enriches one switch export and counts the first occurrence of each attempt ID. */
public final class Processor {
    private static final List<String> ATTEMPT_HEADER = Arrays.asList(
            "attempt_id", "call_id", "started_at", "switch_id", "route_id", "sip_code");
    private static final List<String> ROUTE_HEADER = Arrays.asList(
            "route_id", "route_name", "region", "carrier");

    private Processor() {
    }

    public static void process(Path input, Path routes, Path out)
            throws IOException, NoSuchAlgorithmException {
        Map<String, Route> directory = loadDirectory(routes);
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        Set<String> seen = new HashSet<>();
        SortedMap<Instant, SortedMap<String, Counts>> windows = new TreeMap<>();
        long rows = 0;

        Files.createDirectories(out);
        try (DigestInputStream bytes = new DigestInputStream(Files.newInputStream(input), digest);
             Csv feed = new Csv(input.toString(),
                     new InputStreamReader(bytes, StandardCharsets.UTF_8.newDecoder()));
             Writer enriched = writer(out.resolve("enriched.csv"));
             Writer attempts = writer(out.resolve("attempts.json"))) {
            requireHeader(feed, ATTEMPT_HEADER);
            List<String> header = new ArrayList<>(ATTEMPT_HEADER);
            header.addAll(Arrays.asList("route_name", "region", "carrier", "window_start",
                    "outcome", "duplicate"));
            Csv.write(enriched, header);
            attempts.write("[");
            List<String> row;
            while ((row = feed.next()) != null) {
                requireFields(feed, row, ATTEMPT_HEADER);
                String attemptId = row.get(0);
                Instant start = windowStart(feed, row.get(2));
                Route route = directory.get(row.get(4));
                if (route == null) {
                    throw feed.invalid("unknown route_id " + row.get(4));
                }
                String code = row.get(5);
                if (!code.matches("[0-9]{3}")) {
                    throw feed.invalid("sip_code must contain three digits");
                }
                int sip = Integer.parseInt(code);
                Outcome outcome = Outcome.from(sip);
                boolean duplicate = !seen.add(attemptId);
                if (!duplicate) {
                    if (seen.size() > 1) {
                        attempts.write(",");
                    }
                    attempts.write("\n  " + attemptJson(row, sip, outcome));
                    windows.computeIfAbsent(start, key -> new TreeMap<>())
                            .computeIfAbsent(route.id, key -> new Counts()).add(outcome);
                }
                row.addAll(Arrays.asList(route.name, route.region, route.carrier,
                        start.toString(), outcome.name(), Boolean.toString(duplicate)));
                Csv.write(enriched, row);
                rows++;
            }
            attempts.write("\n]\n");
        }

        String filename = input.getFileName().toString();
        String batch = filename.endsWith(".csv") ? filename.substring(0, filename.length() - 4) : filename;
        String sourceSha256 = DatatypeConverter.printHexBinary(digest.digest()).toLowerCase(Locale.ROOT);
        try (Writer summary = writer(out.resolve("summary.json"))) {
            summary.write("{\n  \"batch\":" + json(batch)
                    + ",\n  \"sourceSha256\":" + json(sourceSha256)
                    + ",\n  \"rows\":" + rows + ",\n  \"attempts\":" + seen.size()
                    + ",\n  \"duplicates\":" + (rows - seen.size()) + ",\n  \"windows\":[");
            boolean first = true;
            for (Map.Entry<Instant, SortedMap<String, Counts>> window : windows.entrySet()) {
                for (Map.Entry<String, Counts> item : window.getValue().entrySet()) {
                    if (!first) {
                        summary.write(",");
                    }
                    first = false;
                    Route route = directory.get(item.getKey());
                    Counts counts = item.getValue();
                    summary.write("\n    {\"start\":" + json(window.getKey().toString())
                            + ",\"routeId\":" + json(route.id) + ",\"routeName\":" + json(route.name)
                            + ",\"region\":" + json(route.region) + ",\"carrier\":" + json(route.carrier)
                            + ",\"attempts\":" + counts.attempts + ",\"connected\":" + counts.connected
                            + ",\"busy\":" + counts.busy + ",\"unavailable\":" + counts.unavailable
                            + ",\"other\":" + counts.other + "}");
                }
            }
            summary.write("\n  ]\n}\n");
        }
    }

    private static BufferedWriter writer(Path path) throws IOException {
        return Files.newBufferedWriter(path, StandardCharsets.UTF_8);
    }

    private static Map<String, Route> loadDirectory(Path path) throws IOException {
        Map<String, Route> routes = new HashMap<>();
        try (Csv feed = new Csv(path.toString(), Files.newBufferedReader(path, StandardCharsets.UTF_8))) {
            requireHeader(feed, ROUTE_HEADER);
            List<String> row;
            while ((row = feed.next()) != null) {
                requireFields(feed, row, ROUTE_HEADER);
                Route route = new Route(row);
                if (routes.put(route.id, route) != null) {
                    throw feed.invalid("repeated route_id " + route.id);
                }
            }
        }
        return routes;
    }

    private static void requireHeader(Csv feed, List<String> header) throws IOException {
        if (!header.equals(feed.next())) {
            throw feed.invalid("expected header " + String.join(",", header));
        }
    }

    private static void requireFields(Csv feed, List<String> row, List<String> columns) throws IOException {
        if (row.size() != columns.size()) {
            throw feed.invalid("expected " + columns.size() + " fields, found " + row.size());
        }
        for (int i = 0; i < columns.size(); i++) {
            if (row.get(i).trim().isEmpty()) {
                throw feed.invalid("missing " + columns.get(i));
            }
        }
    }

    private static Instant windowStart(Csv feed, String timestamp) throws IOException {
        Instant instant;
        try {
            instant = Instant.parse(timestamp);
        } catch (DateTimeParseException e) {
            throw feed.invalid("invalid started_at " + timestamp);
        }
        if (!instant.toString().equals(timestamp) || instant.getNano() != 0) {
            throw feed.invalid("started_at requires UTC time at whole-second precision");
        }
        long second = instant.getEpochSecond();
        return Instant.ofEpochSecond(second - Math.floorMod(second, 900L));
    }

    private enum Outcome {
        CONNECTED, BUSY, UNAVAILABLE, OTHER;

        static Outcome from(int sip) {
            switch (sip) {
                case 200: return CONNECTED;
                case 486: return BUSY;
                case 503: return UNAVAILABLE;
                default: return OTHER;
            }
        }
    }

    private static final class Route {
        final String id;
        final String name;
        final String region;
        final String carrier;

        Route(List<String> fields) {
            id = fields.get(0);
            name = fields.get(1);
            region = fields.get(2);
            carrier = fields.get(3);
        }
    }

    private static final class Counts {
        long attempts;
        long connected;
        long busy;
        long unavailable;
        long other;

        void add(Outcome outcome) {
            attempts++;
            switch (outcome) {
                case CONNECTED: connected++; break;
                case BUSY: busy++; break;
                case UNAVAILABLE: unavailable++; break;
                case OTHER: other++; break;
            }
        }
    }

    private static String attemptJson(List<String> row, int sip, Outcome outcome) {
        return "{\"id\":" + json(row.get(0)) + ",\"callId\":" + json(row.get(1))
                + ",\"time\":" + json(row.get(2)) + ",\"switchId\":" + json(row.get(3))
                + ",\"routeId\":" + json(row.get(4)) + ",\"sip\":" + sip
                + ",\"outcome\":" + json(outcome.name()) + "}";
    }

    private static String json(String text) {
        StringBuilder value = new StringBuilder("\"");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            switch (c) {
                case '"': value.append("\\\""); break;
                case '\\': value.append("\\\\"); break;
                case '\n': value.append("\\n"); break;
                case '\r': value.append("\\r"); break;
                case '\t': value.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        value.append(String.format("\\u%04x", (int) c));
                    } else {
                        value.append(c);
                    }
            }
        }
        return value.append('"').toString();
    }
}
