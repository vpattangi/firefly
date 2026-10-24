// Yes/no confirmation that works on native and web (React Native Web's Alert ignores buttons).
import { Alert, Platform } from 'react-native';

export function confirmAction(title: string, message: string, confirmText: string, cancelText = 'Cancel'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  );
}
