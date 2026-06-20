import { Platform } from 'react-native';

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function client() {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  return supabase;
}

function projectIdFromConfig() {
  const easProjectId =
    Constants.easConfig?.projectId ||
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  if (!easProjectId || easProjectId === 'YOUR_EAS_PROJECT_ID') {
    return undefined;
  }

  return easProjectId;
}

export async function registerForPushNotifications(userId: string) {
  if (Platform.OS === 'web') {
    return null;
  }

  if (Constants.executionEnvironment === 'storeClient' && Platform.OS === 'android') {
    throw new Error(
      'Push notifications require a development build or release app on Android. Expo Go does not support remote push on Expo SDK 54.'
    );
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      importance: Notifications.AndroidImportance.MAX,
      lightColor: '#FF615A',
      name: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const existingPermissions = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = projectIdFromConfig();
  if (!projectId) {
    throw new Error(
      'Push notifications are missing an EAS project ID. Add expo.extra.eas.projectId or set EXPO_PUBLIC_EAS_PROJECT_ID.'
    );
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResponse.data;

  const { error } = await client().from('user_push_tokens').upsert(
    {
      expo_push_token: expoPushToken,
      last_seen_at: new Date().toISOString(),
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
      user_id: userId,
    },
    {
      onConflict: 'user_id,expo_push_token',
    }
  );

  if (error) {
    throw error;
  }

  return expoPushToken;
}

export async function sendPushNotification(args: {
  body: string;
  data?: Record<string, unknown>;
  recipientUserId: string;
  title?: string;
}) {
  try {
    await client().functions.invoke('send-push', {
      body: {
        body: args.body,
        data: args.data || {},
        recipientUserId: args.recipientUserId,
        title: args.title || 'ShinDig',
      },
    });
  } catch {
    return;
  }
}
