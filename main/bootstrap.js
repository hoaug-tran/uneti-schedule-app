import { app } from "electron";
import path from "path";

app.setPath(
  "userData",
  path.join(app.getPath("appData"), "uneti-schedule-widget")
);

export { app };
