import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Comment } from '../types/comment';

const COMMENTS = 'comments';

export async function addComment(params: {
  stopId: string;
  userId: string;
  message: string;
}): Promise<string> {
  const ref = doc(collection(db, COMMENTS));
  await setDoc(ref, {
    commentId: ref.id,
    stopId: params.stopId,
    userId: params.userId,
    message: params.message.trim(),
    timestamp: serverTimestamp(),
  });
  return ref.id;
}

export async function getCommentsForStop(stopId: string): Promise<Comment[]> {
  const q = query(collection(db, COMMENTS), where('stopId', '==', stopId));
  const snap = await getDocs(q);
  const out: Comment[] = [];
  snap.forEach((d) => {
    const v = d.data() as any;
    out.push({
      commentId: d.id,
      stopId: v.stopId,
      userId: v.userId,
      message: v.message,
      timestamp: v.timestamp,
    });
  });
  out.sort((a, b) => {
    const ta = a.timestamp?.toMillis?.() ?? 0;
    const tb = b.timestamp?.toMillis?.() ?? 0;
    return ta - tb;
  });
  return out;
}
