import { app } from "./app.js";

// Render assigns the port and expects the service to listen on it. The
// fallback is for local runs only.
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
