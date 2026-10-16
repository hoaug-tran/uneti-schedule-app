import { app } from "electron";
import path from "path";

app.setPath(
  "userData",
  !app.isPackaged && process.env.NODE_ENV === "test" && process.env.UNETI_TEST_USER_DATA
    ? path.resolve(process.env.UNETI_TEST_USER_DATA)
    : path.join(app.getPath("appData"), "uneti-schedule-widget")
);

export { app };
