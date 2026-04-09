const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function db() {
  return getFirestore();
}

/**
 * When combined transcript URL is set on yuja_funny_urls, ensure homework submissions
 * that reference this doc get premergedWalkthroughTranscriptionUrl (recovery / idempotency),
 * then log for downstream automation.
 * @param {string} yujaDocId
 * @param {string} combinedTranscriptionUrl
 * @param {FirebaseFirestore.DocumentReference} yujaRef
 */
async function handleYujaCombinedTranscriptionReady(yujaDocId, combinedTranscriptionUrl, yujaRef) {
  if (!combinedTranscriptionUrl || !String(combinedTranscriptionUrl).trim()) return;

  const snap = await db()
    .collection("homeworkSubmissions")
    .where("yujaFunnyUrlsDocId", "==", yujaDocId)
    .limit(20)
    .get();

  for (const doc of snap.docs) {
    const d = doc.data();
    const existing = d.premergedWalkthroughTranscriptionUrl;
    if (existing && String(existing).trim()) continue;

    await doc.ref.update({
      premergedWalkthroughTranscriptionUrl: combinedTranscriptionUrl,
      yujaCombinedTranscriptionSyncedAt: FieldValue.serverTimestamp(),
    });
    console.log(
      `[yuja_funny_urls] synced premergedWalkthroughTranscriptionUrl to submission ${doc.id} from yuja ${yujaDocId}`
    );
  }

  await yujaRef.update({
    combinedTranscriptionListenerAt: FieldValue.serverTimestamp(),
  });
  console.log(
    `[yuja_funny_urls] combined transcript ready doc=${yujaDocId} url=${String(combinedTranscriptionUrl).slice(0, 72)}…`
  );
}

/**
 * Firestore onUpdate: before/after document data
 */
async function handleYujaFunnyUrlsUpdated(before, after, docId, afterRef) {
  const prevUrl = before?.combinedTranscriptionUrl;
  const nextUrl = after?.combinedTranscriptionUrl;
  if (!nextUrl || !String(nextUrl).trim()) return;
  if (prevUrl === nextUrl) return;

  await handleYujaCombinedTranscriptionReady(docId, String(nextUrl).trim(), afterRef);
}

module.exports = {
  handleYujaFunnyUrlsUpdated,
  handleYujaCombinedTranscriptionReady,
};
