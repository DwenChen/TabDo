import type { EditorProjectData } from "@presentation/components/video-editor/projectPersistence";
export type ProjectPreviewData = {
	project: EditorProjectData;
	videoUrl: string;
	webcamUrl: string | null;
};
