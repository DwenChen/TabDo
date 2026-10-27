export type SidebarCard = {
	id: string;
	image?: string;
	imageAlt?: string;
	heading: string;
	subheading?: string;
	paragraph?: string;
	href?: string;
	linkLabel?: string;
};

/** Code-only sidebar content. Empty cards or enabled:false hides this area. */
export const sidebarCardConfig: { enabled: boolean; cards: SidebarCard[] } = {
	enabled: false,
	cards: [
		{
			id: "placeholder",
			image: "announcements/placeholder-1.svg",
			imageAlt: "Placeholder banner",
			heading: "尚未提供",
			subheading: "News from Recordly",
			paragraph: "A place for updates, tips, and announcements.",
		},
	],
};
