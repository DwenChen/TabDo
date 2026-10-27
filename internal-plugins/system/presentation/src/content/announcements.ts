import type { AnnouncementFeed } from "@presentation/lib/announcements";

/** Announcements bundled with a release. Use a new ID when an item should be shown again. */
export const BUNDLED_ANNOUNCEMENT_FEED: AnnouncementFeed = {
	settings: {
		aspectRatio: "4:3",
	},
	announcements: [],
};
