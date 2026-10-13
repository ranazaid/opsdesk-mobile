import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Member } from '@/api/schemas';
import { Avatar } from '@/components/ui/Avatar';
import { isAssignable, ROLE_LABELS } from '@/permissions/matrix';
import { useTheme } from '@/theme/ThemeProvider';

export interface AssigneePickerProps {
  visible: boolean;
  members: Member[] | undefined;
  loading: boolean;
  /** Current assignee's user id. */
  currentId: string | null;
  onSelect: (member: Member | null) => void;
  onClose: () => void;
}

export function AssigneePicker({ visible, members, loading, currentId, onSelect, onClose }: AssigneePickerProps) {
  const { colors, typography, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const assignable = (members ?? []).filter((member) => isAssignable(member.role));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        <Text style={[typography.heading, styles.title, { color: colors.text }]}>Assign ticket</Text>
        {loading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : (
          <FlatList
            data={[null, ...assignable]}
            keyExtractor={(member) => member?.userId ?? 'unassigned'}
            renderItem={({ item }) => {
              const selected = (item?.userId ?? null) === currentId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item ? `Assign to ${item.name}` : 'Unassign'}
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  {item ? (
                    <Avatar name={item.name} size={34} />
                  ) : (
                    <View style={[styles.unassigned, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="person-remove-outline" size={16} color={colors.textSubtle} />
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={[typography.bodyStrong, { color: colors.text }]}>{item ? item.name : 'Unassigned'}</Text>
                    {item ? <Text style={[typography.caption, { color: colors.textSubtle }]}>{ROLE_LABELS[item.role]}</Text> : null}
                  </View>
                  {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '70%', paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { paddingHorizontal: 20, paddingVertical: 8 },
  loading: { padding: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  rowText: { flex: 1 },
  unassigned: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
