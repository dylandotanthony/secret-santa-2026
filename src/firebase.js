import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore';

// Firebase web config (public by design; Firestore rules control what can be written)
const firebaseConfig = {
  apiKey: 'AIzaSyBbX2FqmboYLKZ1aUi5-JA1aTUsNtIU1no',
  authDomain: 'secret-santa-2026-8d87a.firebaseapp.com',
  projectId: 'secret-santa-2026-8d87a',
  storageBucket: 'secret-santa-2026-8d87a.firebasestorage.app',
  messagingSenderId: '204333678306',
  appId: '1:204333678306:web:61af321f6843c0cb0228bb'
};

const db = getFirestore(initializeApp(firebaseConfig));
const drawRef = doc(db, 'draw', 'official');

// Calls back with { [participantId]: { wishlistUrl, notes } } whenever anyone saves a list
export function subscribeToWishlists(onChange, onError) {
  return onSnapshot(
    collection(db, 'wishlists'),
    snap => {
      const lists = {};
      snap.forEach(d => {
        lists[d.id] = d.data();
      });
      onChange(lists);
    },
    onError
  );
}

// Calls back with the official draw ({ pairs, drawnAt, enforceCouples }) or null if not drawn yet
export function subscribeToDraw(onChange, onError) {
  return onSnapshot(drawRef, snap => onChange(snap.exists() ? snap.data() : null), onError);
}

export function saveWishlist(participantId, wishlistUrl, notes) {
  return setDoc(doc(db, 'wishlists', participantId), {
    wishlistUrl,
    notes,
    updatedAt: serverTimestamp()
  });
}

// Saves the draw only if nobody has drawn yet; throws 'already-drawn' otherwise
export function saveOfficialDraw(pairs, drawnAt, enforceCouples) {
  return runTransaction(db, async tx => {
    const existing = await tx.get(drawRef);
    if (existing.exists()) throw new Error('already-drawn');
    tx.set(drawRef, {
      // Firestore can't store nested arrays, so each pair is a { giver, receiver } map
      pairs: pairs.map(([giver, receiver]) => ({ giver, receiver })),
      drawnAt,
      enforceCouples
    });
  });
}
