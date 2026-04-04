import claimRoute from "./routes/claim.js";

export function registerRoutes(app: any) {
  app.use("/api", claimRoute);
}
