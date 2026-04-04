import claimRoute from "./routes/claim";

export function registerRoutes(app: any) {
  app.use("/api", claimRoute);
}
