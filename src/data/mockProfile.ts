export type OutingAlbum = {
  id: string;
  title: string;
  moment: 'Night' | 'Day';
  date: string;
  location: string;
  photoCount: number;
  coverPhoto: string;
  crew: string[];
  vibe: string;
};

export type UserProfile = {
  name: string;
  handle: string;
  city: string;
  bio: string;
  avatar: string;
  stats: {
    outings: number;
    friends: number;
    saves: number;
  };
};

export type FeedMoment = {
  id: string;
  author: string;
  headline: string;
  caption: string;
  timestamp: string;
};

export const albums: OutingAlbum[] = [
  {
    id: 'night-rooftop',
    title: 'Rooftop Reset',
    moment: 'Night',
    date: 'Fri, Jun 12',
    location: 'Williamsburg',
    photoCount: 42,
    coverPhoto:
      'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
    crew: ['Jules', 'Andre', 'Nina'],
    vibe: 'City lights, house set, long golden hour into midnight.',
  },
  {
    id: 'day-brunch',
    title: 'Brunch Circuit',
    moment: 'Day',
    date: 'Sun, Jun 7',
    location: 'SoHo',
    photoCount: 28,
    coverPhoto:
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80',
    crew: ['Cam', 'Tess'],
    vibe: 'Coffee flights, sidewalk tables, and too many pastries.',
  },
  {
    id: 'night-gallery',
    title: 'After Hours',
    moment: 'Night',
    date: 'Thu, May 28',
    location: 'Chelsea',
    photoCount: 31,
    coverPhoto:
      'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80',
    crew: ['Leah', 'Omar', 'June'],
    vibe: 'Gallery opening, espresso martinis, and a warehouse DJ set.',
  },
  {
    id: 'day-park',
    title: 'Park Drift',
    moment: 'Day',
    date: 'Sat, May 23',
    location: 'Prospect Park',
    photoCount: 19,
    coverPhoto:
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1200&q=80',
    crew: ['Ivy', 'Milo'],
    vibe: 'Bike ride, picnic spread, and a slow afternoon.',
  },
  {
    id: 'night-live-music',
    title: 'Basement Set',
    moment: 'Night',
    date: 'Wed, May 13',
    location: 'Lower East Side',
    photoCount: 36,
    coverPhoto:
      'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
    crew: ['Rae', 'Dani'],
    vibe: 'Sweaty venue, heavy bass, and post-show noodles.',
  },
  {
    id: 'day-beach',
    title: 'Boardwalk Day',
    moment: 'Day',
    date: 'Mon, May 4',
    location: 'Rockaway',
    photoCount: 25,
    coverPhoto:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
    crew: ['Ezra', 'Sol', 'Pia'],
    vibe: 'Salt air, long walk, and sunset fries on the way back.',
  },
];

export const feedMoments: FeedMoment[] = [
  {
    id: 'feed-1',
    author: '@jaleesa',
    headline: 'Late patio run before the storm',
    caption: 'Golden light, three mocktails, and a packed camera roll.',
    timestamp: '12m ago',
  },
  {
    id: 'feed-2',
    author: '@caminmotion',
    headline: 'Sunset drop from the waterfront',
    caption: 'Boardwalk clips are up. Everyone wants the fried shrimp spot.',
    timestamp: '48m ago',
  },
  {
    id: 'feed-3',
    author: '@omarafterdark',
    headline: 'Warehouse set recap',
    caption: 'Bass-heavy night, neon haze, and the cleanest fit check yet.',
    timestamp: '2h ago',
  },
];
