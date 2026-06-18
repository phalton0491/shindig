export type TimelinePlace = {
  address: string;
  distanceMiles?: number;
  durationLabel: string;
  id: string;
  image?: string;
  latitude: number;
  longitude: number;
  title: string;
  transitMinutes: number;
  transitMiles: number;
  type: string;
  vibeIds: string[];
};

export type UserProfile = {
  avatar: string;
  bio: string;
  city: string;
  handle: string;
  name: string;
  stats: {
    friends: number;
    outings: number;
    saves: number;
  };
};

export type SavedShindigStop = {
  id: string;
  order: number;
  photos: SavedShindigPhoto[];
  place: TimelinePlace;
  scheduledTime?: string;
};

export type SavedShindigPhoto = {
  id: string;
  photoUrl: string;
  stopId: string;
};

export type SavedShindig = {
  coverPhotoUrl: string | null;
  createdAt: string;
  id: string;
  photoCount: number;
  stops: SavedShindigStop[];
  title: string;
};
