import path from "node:path";
import { app } from "@tabdo/presentation-electron";

if (false) {
	const devUserDataPath = path.join(app.getPath("appData"), "Recordly-dev");
	app.setPath("userData", devUserDataPath);
	app.setPath("sessionData", path.join(devUserDataPath, "session"));
}

export const USER_DATA_PATH = __TABDO_PRESENTATION_HOST__.dataRoot;
export const RECORDINGS_DIR = path.join(USER_DATA_PATH, "recordings");
