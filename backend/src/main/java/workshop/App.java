package workshop;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executors;

public final class App {
    public static void main(String[] args) throws Exception {
        if (args.length == 4 && args[0].equals("process")) {
            Processor.process(Paths.get(args[1]), Paths.get(args[2]), Paths.get(args[3]));
            return;
        }
        if (args.length == 3 && args[0].equals("serve")) {
            serve(Paths.get(args[1]), Integer.parseInt(args[2]));
            return;
        }
        throw new IllegalArgumentException("Usage: process INPUT.csv ROUTES.csv OUTPUT_DIR | serve PROCESSED_DIR PORT");
    }

    private static void serve(Path processed, int port) throws IOException {
        Files.createDirectories(processed);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/", exchange -> {
            try {
                handle(exchange, processed);
            } catch (IOException error) {
                System.err.println("Could not deliver response: " + error.getMessage());
            } finally {
                exchange.close();
            }
        });
        server.setExecutor(Executors.newFixedThreadPool(4));
        server.start();
        System.out.println("Route Health: http://127.0.0.1:" + server.getAddress().getPort() + "/ (Ctrl+C to stop)");
    }

    private static void handle(HttpExchange exchange, Path processed) throws IOException {
        if (!exchange.getRequestMethod().equals("GET")) {
            exchange.getResponseHeaders().set("Allow", "GET");
            exchange.sendResponseHeaders(405, -1);
            return;
        }

        String path = exchange.getRequestURI().getPath();
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        if (path.equals("/data/batches.json")) {
            List<String> names = new ArrayList<>();
            try (DirectoryStream<Path> dirs = Files.newDirectoryStream(processed)) {
                for (Path dir : dirs) {
                    String name = dir.getFileName().toString();
                    if (name.matches("[a-z0-9][a-z0-9_-]{0,63}") && Files.isRegularFile(dir.resolve("summary.json"))) {
                        names.add("\"" + name + "\"");
                    }
                }
            }
            Collections.sort(names);
            byte[] body = ("[" + String.join(",", names) + "]").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            return;
        }
        if (path.matches("/data/[a-z0-9][a-z0-9_-]{0,63}/(attempts\\.json|summary\\.json|enriched\\.csv)")) {
            Path file = processed.resolve(path.substring("/data/".length()));
            if (Files.isRegularFile(file)) {
                try (InputStream input = Files.newInputStream(file)) {
                    stream(exchange, path, input);
                }
                return;
            }
        } else if (path.equals("/") || (path.matches("/[A-Za-z0-9_./-]+") && !path.contains("..") && !path.startsWith("/data/"))) {
            String resource = path.equals("/") ? "/index.html" : path;
            try (InputStream input = App.class.getResourceAsStream("/web" + resource)) {
                if (input != null) {
                    stream(exchange, resource, input);
                    return;
                }
            }
        }
        exchange.sendResponseHeaders(404, -1);
    }

    private static void stream(HttpExchange exchange, String name, InputStream input) throws IOException {
        String type = "application/octet-stream";
        if (name.endsWith(".html")) type = "text/html; charset=utf-8";
        else if (name.endsWith(".js")) type = "application/javascript; charset=utf-8";
        else if (name.endsWith(".css")) type = "text/css; charset=utf-8";
        else if (name.endsWith(".json")) type = "application/json";
        else if (name.endsWith(".csv")) type = "text/csv; charset=utf-8";
        else if (name.endsWith(".svg")) type = "image/svg+xml";
        else if (name.endsWith(".woff2")) type = "font/woff2";
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.sendResponseHeaders(200, 0);
        try (OutputStream output = exchange.getResponseBody()) {
            byte[] buffer = new byte[16384];
            int bytes;
            while ((bytes = input.read(buffer)) != -1) output.write(buffer, 0, bytes);
        }
    }
}
