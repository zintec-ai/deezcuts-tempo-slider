// Serves test/ at http://localhost:<port>/ so that the widget loads in a
// normal http page. The default port is 8080. If a different program uses
// the port, the script tries the next port (max. 10 ports).
// Run: npm run serve
//      npm run serve -- --port 9000
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const portArg = process.argv.indexOf("--port");
const firstPort = (portArg !== -1 && Number(process.argv[portArg + 1])) || 8080;

function start(port) {
  const server = createServer(async (req, res) => {
    if (req.url !== "/" && req.url !== "/index.html") {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const html = await readFile(new URL("../test/index.html", import.meta.url));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    } catch (err) {
      res.writeHead(500).end(`cannot read test/index.html: ${err.message}`);
    }
  });
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && port < firstPort + 10) {
      console.log(`port ${port} is in use, trying ${port + 1}`);
      start(port + 1);
    } else {
      console.error(err.message);
      process.exit(1);
    }
  });
  server.listen(port, () => console.log(`test page: http://localhost:${port}/  (stop with Ctrl+C)`));
}

start(firstPort);
