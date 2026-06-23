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
    shindigs: number;
  };
};

export type FriendProfile = {
  avatar: string;
  city: string;
  handle: string;
  id: string;
  name: string;
};

export type FriendRequest = {
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  profile: FriendProfile;
  status: 'pending';
};

export type FeedComment = {
  author: FriendProfile;
  body: string;
  createdAt: string;
  id: string;
};

export type ShindigState = 'active' | 'completed';

export type SavedShindigStop = {
  id: string;
  order: number;
  photos: SavedShindigPhoto[];
  place: TimelinePlace;
  scheduledTime?: string;
};

export type SavedShindigPhoto = {
  comments: FeedComment[];
  contributor?: FriendProfile;
  createdAt: string;
  id: string;
  likeCount: number;
  likedByMe: boolean;
  photoUrl: string;
  stopId: string;
};

export type SavedShindig = {
  comments: FeedComment[];
  coverPhotoUrl: string | null;
  coverPhotoPhotoId?: string | null;
  createdAt: string;
  id: string;
  invitedBy?: FriendProfile;
  likeCount: number;
  likedByMe: boolean;
  ownerId: string;
  photoCount: number;
  state: ShindigState;
  stops: SavedShindigStop[];
  title: string;
};

export type FeedShindig = SavedShindig & {
  owner: FriendProfile;
};

export type AppNotification = {
  actor: FriendProfile;
  createdAt: string;
  id: string;
  inviteId?: string;
  inviteStatus?: 'accepted' | 'pending' | 'rejected';
  message: string;
  photoId?: string;
  requestId?: string;
  requestPhotoUrl?: string;
  requestStatus?: 'approved' | 'pending' | 'rejected';
  readAt?: string;
  shindigId?: string;
  type:
    | 'friend_accept'
    | 'friend_reject'
    | 'friend_request'
    | 'photo_add_request'
    | 'photo_comment'
    | 'photo_like'
    | 'shindig_invite'
    | 'shindig_comment'
    | 'shindig_like';
};
