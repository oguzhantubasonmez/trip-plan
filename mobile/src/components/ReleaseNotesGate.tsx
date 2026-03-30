import Constants from 'expo-constants';
import { useCallback, useEffect, useState } from 'react';
import { getReleaseNotesForVersion } from '../constants/releaseNotes';
import {
  acknowledgeReleaseNotes,
  isReleaseNotesDismissedForVersion,
  isReleaseNotesSuppressedGlobally,
} from '../services/releaseNotesStorage';
import { ReleaseNotesModal } from './ReleaseNotesModal';

function appVersion(): string {
  const v =
    Constants.expoConfig?.version ??
    (Constants as unknown as { nativeAppVersion?: string }).nativeAppVersion;
  return String(v ?? '1.0.0').trim() || '1.0.0';
}

/**
 * Oturum açıkken: bu sürüm için not varsa ve kullanıcı kapatmadıysa bir kez modal gösterir.
 */
export function ReleaseNotesGate() {
  const [visible, setVisible] = useState(false);
  const [body, setBody] = useState('');
  const version = appVersion();

  const evaluate = useCallback(async () => {
    const notes = getReleaseNotesForVersion(version);
    if (!notes) {
      setVisible(false);
      return;
    }
    if (await isReleaseNotesSuppressedGlobally()) {
      setVisible(false);
      return;
    }
    const dismissed = await isReleaseNotesDismissedForVersion(version);
    if (dismissed) {
      setVisible(false);
      return;
    }
    setBody(notes);
    setVisible(true);
  }, [version]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  const handleClose = useCallback(
    async (suppressAllFuture: boolean) => {
      setVisible(false);
      await acknowledgeReleaseNotes(version, suppressAllFuture);
    },
    [version]
  );

  if (!visible || !body) return null;

  return (
    <ReleaseNotesModal
      visible={visible}
      version={version}
      body={body}
      onClose={(d) => void handleClose(d)}
    />
  );
}
