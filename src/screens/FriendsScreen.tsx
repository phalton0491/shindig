import { useDeferredValue, useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addFriend } from '../lib/friends';
import { searchProfilesByUsername } from '../lib/profiles';
import { theme } from '../theme';
import { FriendProfile, UserProfile } from '../types/models';

type FriendsScreenProps = {
  friends: FriendProfile[];
  onFriendsChanged: () => Promise<void>;
  onOpenFriend: (friendId: string) => void;
  onOpenProfile: () => void;
  profile: UserProfile;
  userId: string;
};

export function FriendsScreen({
  friends,
  onFriendsChanged,
  onOpenFriend,
  onOpenProfile,
  profile,
  userId,
}: FriendsScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[]>([]);
  const [error, setError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [addingFriendId, setAddingFriendId] = useState('');
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let isMounted = true;

    async function runSearch() {
      const normalizedQuery = deferredQuery.trim();
      if (normalizedQuery.length < 2) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const nextResults = await searchProfilesByUsername({
          currentUserId: userId,
          excludedUserIds: friends.map((friend) => friend.id),
          query: normalizedQuery,
        });

        if (isMounted) {
          setResults(nextResults);
        }
      } catch (nextError) {
        if (isMounted) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to search users.');
        }
      } finally {
        if (isMounted) {
          setIsSearching(false);
        }
      }
    }

    runSearch();

    return () => {
      isMounted = false;
    };
  }, [deferredQuery, friends, userId]);

  async function handleAddFriend(friend: FriendProfile) {
    setAddingFriendId(friend.id);
    setError('');

    try {
      await addFriend({ friendId: friend.id, userId });
      await onFriendsChanged();
      setResults((current) => current.filter((result) => result.id !== friend.id));
      setQuery('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to add friend.');
    } finally {
      setAddingFriendId('');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.kicker}>FRIENDS</Text>
            <Text style={styles.title}>Build your ShinDig circle.</Text>
          </View>
          <Pressable onPress={onOpenProfile} style={styles.avatarButton}>
            <Image source={{ uri: profile.avatar }} style={styles.avatar} />
          </Pressable>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.cardTitle}>Add friends by username</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={(value) => {
              setQuery(value);
              setError('');
            }}
            placeholder="Search usernames"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={query}
          />
          {isSearching ? <Text style={styles.helperText}>Searching users...</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.resultsList}>
            {results.map((result) => (
              <View key={result.id} style={styles.resultRow}>
                <View style={styles.resultCopy}>
                  <Image source={{ uri: result.avatar }} style={styles.resultAvatar} />
                  <View style={styles.resultText}>
                    <Text style={styles.resultName}>{result.name}</Text>
                    <Text style={styles.resultMeta}>
                      {result.handle} · {result.city}
                    </Text>
                  </View>
                </View>
                <Pressable
                  disabled={addingFriendId === result.id}
                  onPress={() => handleAddFriend(result)}
                  style={styles.addButton}
                >
                  <Text style={styles.addButtonText}>
                    {addingFriendId === result.id ? 'Adding...' : 'Add'}
                  </Text>
                </Pressable>
              </View>
            ))}
            {!isSearching && deferredQuery.trim().length >= 2 && results.length === 0 ? (
              <Text style={styles.helperText}>No usernames matched that search.</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your friends</Text>
          <Text style={styles.sectionCount}>{friends.length}</Text>
        </View>

        {friends.length > 0 ? (
          <View style={styles.friendList}>
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                onPress={() => onOpenFriend(friend.id)}
                style={styles.friendCard}
              >
                <Image source={{ uri: friend.avatar }} style={styles.friendAvatar} />
                <View style={styles.friendText}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendMeta}>
                    {friend.handle} · {friend.city}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            Add friends to see their ShinDigs show up on the home feed.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kicker: {
    color: theme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: theme.spacing.sm,
    maxWidth: 240,
  },
  avatarButton: {
    borderColor: theme.colors.border,
    borderRadius: theme.radius.round,
    borderWidth: 2,
    padding: 2,
  },
  avatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  searchCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    color: theme.colors.textPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  helperText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: theme.spacing.sm,
  },
  errorText: {
    color: '#FF9F8A',
    fontSize: 13,
    marginTop: theme.spacing.sm,
  },
  resultsList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  resultRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceRaised,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  resultCopy: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  resultAvatar: {
    borderRadius: theme.radius.round,
    height: 44,
    width: 44,
  },
  resultText: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  resultName: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  resultMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#FF615A',
    borderRadius: theme.radius.round,
    marginLeft: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xl,
  },
  sectionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },
  sectionCount: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  friendList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  friendCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    padding: theme.spacing.md,
  },
  friendAvatar: {
    borderRadius: theme.radius.round,
    height: 52,
    width: 52,
  },
  friendText: {
    marginLeft: theme.spacing.md,
  },
  friendName: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  friendMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing.md,
  },
});
