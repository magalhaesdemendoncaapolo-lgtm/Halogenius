import { app } from "./runtime.js";
import { host, port } from "./server_host.js";

await app.listen({ host, port });
